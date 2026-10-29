import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { OutcomeProbabilities } from "#lib/domain/odds.ts";
import type { Offer } from "#lib/domain/offer.ts";
import { valueEligibility, type ModelArtifact } from "../models/artifact.ts";
import { PROSPECTIVE_PROTOCOL } from "../models/release.ts";
import { parseArtifact } from "../models/inputs.ts";
import {
  freezeProspectiveForecast,
  INPUT_AVAILABILITY,
  type StarterAssumption,
  type WeatherSnapshot,
} from "../models/forecast.ts";
import {
  recentStarter,
  starterAssumption,
  starterDecision,
  type InjuryDesignation,
} from "../models/starter.ts";
import { depthChartFromCsv, readSeasonFiles, type DepthChartEntry } from "../sources/roster.ts";
import type { Market, PricedGame } from "../models/games.ts";
import { upcomingGameFromCsv } from "../models/history.ts";
import { readGames } from "../models/train.ts";
import type { AnchorQuote } from "../models/anchor.ts";
import type { EvidenceItem } from "../sources/contracts.ts";
import type { ScheduledGame } from "../sources/contracts.ts";
import type { UncertaintyAssessment } from "../models/uncertainty.ts";
import { POLICY_VERSION } from "./policy.ts";
import type { SavedForecast } from "./forecast-record.ts";
import type { ForecastSource } from "./run.ts";

/**
 * What a run froze about the model. Probabilities are recorded even when the market is not
 * eligible, so the model can be scored on real offers later. Only an eligible result may reach
 * the value policy or the report.
 */
export type RunModel =
  | { status: "unavailable"; reason: string }
  | {
      status: "computed";
      artifact: {
        checksum: string;
        version: number;
        trainingCutoff: string;
        releaseStatus: ModelArtifact["releaseStatus"];
        releasedMarkets: Market[];
      };
      probabilities: OutcomeProbabilities;
      uncertainty: UncertaintyAssessment;
      eligible: boolean;
      reason: string;
      protocol: { id: string; role: "independent"; blockingReason: string };
    };

export type ModelSource = (
  game: ScheduledGame,
  cutoffIso: string,
  offer: Offer,
  /** The anchor sportsbook's two sides, when the offer's price was shopped from another book. */
  anchor?: AnchorQuote,
) => Promise<RunModel>;

export const noModel: ModelSource = async () => ({
  status: "unavailable",
  reason: "No model artifact is configured.",
});

function unavailable(reason: string): RunModel {
  return { status: "unavailable", reason };
}

/** Loads a fitted artifact and prices the offer from finished games before the decision cutoff. */
export function createArtifactModel(input: {
  artifactPath: string;
  schedulePath: string;
  /** Where npm run data:depth-charts keeps a season's file. Without it starters come from history. */
  depthChartPath?: (season: number) => string;
}): ModelSource {
  return async (game, cutoffIso, offer, anchor) => {
    if (!existsSync(input.artifactPath)) {
      return unavailable(`No model artifact at ${input.artifactPath}. Run npm run model:fit.`);
    }
    let artifact: ModelArtifact;
    try {
      const value: unknown = JSON.parse(readFileSync(input.artifactPath, "utf8"));
      artifact = parseArtifact(value);
    } catch (error) {
      return unavailable(
        `The model artifact is unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const { checksum } = artifact;
    if (Date.parse(game.kickoff) <= Date.parse(artifact.trainingCutoff)) {
      return unavailable(
        `The model artifact was trained on games through ${artifact.trainingCutoff}, which includes this game.`,
      );
    }
    if (Date.parse(artifact.trainingCutoff) > Date.parse(cutoffIso)) {
      return unavailable("The model artifact was trained after this research decision cutoff.");
    }
    if (!existsSync(input.schedulePath)) {
      return unavailable(`No schedule at ${input.schedulePath}. Run npm run data:schedule.`);
    }
    const forecast = forecastOffer(input, artifact, game, cutoffIso, offer, undefined, anchor);
    if (typeof forecast === "string") return unavailable(forecast);
    const { probabilities, uncertainty } = forecast;
    const eligibility = valueEligibility(artifact, offer.market);
    const protocolReason = eligibility.eligible
      ? `${PROSPECTIVE_PROTOCOL.id} released this market. Release eligibility is not a profitability claim.`
      : artifact.releaseStatus === "released-experimental"
        ? `${PROSPECTIVE_PROTOCOL.id} has not released the ${offer.market} market. ${eligibility.reason}`
        : `${PROSPECTIVE_PROTOCOL.id} blocks release: independent prospective evidence is missing. ${eligibility.reason}`;
    return {
      status: "computed",
      artifact: {
        checksum,
        version: artifact.version,
        trainingCutoff: artifact.trainingCutoff,
        releaseStatus: artifact.releaseStatus,
        releasedMarkets: artifact.releasedMarkets,
      },
      probabilities,
      uncertainty,
      eligible: eligibility.eligible,
      reason: eligibility.reason,
      protocol: {
        id: PROSPECTIVE_PROTOCOL.id,
        role: PROSPECTIVE_PROTOCOL.role,
        blockingReason: protocolReason,
      },
    };
  };
}

/** The kickoff forecast already collected, read back as the snapshot the forecast records. */
/**
 * Quarterback designations from collected injury evidence. nflverse rows carry no publication
 * time, so the retrieval time stands in: the report existed no later than it was retrieved.
 */
export function quarterbackInjuries(evidence: EvidenceItem[] | undefined): InjuryDesignation[] {
  return (evidence ?? []).flatMap((item) => {
    const { team, playerId, position, reportStatus } = item.facts;
    if (position !== "QB" || typeof playerId !== "string" || typeof team !== "string") return [];
    if (typeof reportStatus !== "string" || reportStatus === "") return [];
    return [
      {
        team,
        playerId,
        status: reportStatus,
        publishedAt: item.publishedAt === "unknown" ? item.retrievedAt : item.publishedAt,
      },
    ];
  });
}

function weatherSnapshot(
  game: ScheduledGame,
  evidence: EvidenceItem[] | undefined,
): WeatherSnapshot {
  const item = evidence?.find((entry) => entry.factKey === "weather:kickoff");
  const number = (key: string) => {
    const value = item?.facts[key];
    return typeof value === "number" ? value : null;
  };
  const windText = item?.facts.wind;
  const wind = typeof windText === "string" ? Number(windText.match(/\d+(\.\d+)?/)?.[0]) : null;
  return {
    roof: game.venue.roof,
    windMph: Number.isFinite(wind) ? wind : null,
    precipitationChance: number("precipitationChancePercent"),
    temperatureF: number("temperatureF"),
    observedAt: item && item.publishedAt !== "unknown" ? item.publishedAt : null,
  };
}

type ScheduleHistory = { key: string; csv: string; games: PricedGame[] };
let cachedHistory: ScheduleHistory | null = null;

/**
 * Finished games with the play-by-play efficiency the model was trained on. Without it every
 * efficiency feature reads zero, far outside anything the model saw. Reused until the schedule or
 * a play-by-play file changes.
 */
function scheduleHistory(schedulePath: string): ScheduleHistory {
  const directory = dirname(schedulePath);
  const files = [
    schedulePath,
    ...readdirSync(directory)
      .filter((name) => /^play_by_play_\d{4}\.csv$/.test(name))
      .sort()
      .map((name) => join(directory, name)),
  ];
  const key = files.map((file) => `${file}:${statSync(file).mtimeMs}`).join("|");
  if (cachedHistory?.key !== key) {
    cachedHistory = {
      key,
      csv: readFileSync(schedulePath, "utf8"),
      games: readGames(schedulePath),
    };
  }
  return cachedHistory;
}

const depthChartCache = new Map<string, { key: string; rows: DepthChartEntry[] }>();

/** A season's quarterback depth chart, reused until its file changes. */
function seasonDepthChart(season: number, path: string): DepthChartEntry[] {
  const key = existsSync(path) ? `${statSync(path).mtimeMs}` : "missing";
  const cached = depthChartCache.get(path);
  if (cached?.key === key) return cached.rows;
  const rows = readSeasonFiles([{ season, path }], depthChartFromCsv, "Depth chart").rows.filter(
    (entry) => entry.position === "QB",
  );
  depthChartCache.set(path, { key, rows });
  return rows;
}

/** The offer and its opposing side as one sportsbook's two-sided quote, when they share a book. */
function sameBookQuote(offer: Offer): AnchorQuote | null {
  if (!offer.opposing || offer.opposing.sportsbook !== offer.sportsbook) return null;
  const homeSide = offer.selection === "home" || offer.selection === "over";
  return {
    sportsbook: offer.sportsbook,
    homeAmerican: homeSide ? offer.americanOdds : offer.opposing.americanOdds,
    awayAmerican: homeSide ? offer.opposing.americanOdds : offer.americanOdds,
    ...(offer.pointLine === null
      ? {}
      : { line: offer.market === "spread" && !homeSide ? -offer.pointLine : offer.pointLine }),
  };
}

/**
 * The one way an offer is priced: play-by-play history, decision-time starters, and the offer's
 * own two-sided quote as the anchor. Returns the reason when there is no forecast.
 */
function forecastOffer(
  input: { schedulePath: string; depthChartPath?: (season: number) => string },
  artifact: ModelArtifact,
  game: ScheduledGame,
  cutoffIso: string,
  offer: Offer,
  evidence: EvidenceItem[] | undefined,
  anchor: AnchorQuote | undefined,
): SavedForecast | string {
  const anchorQuote = anchor ?? sameBookQuote(offer);
  if (!anchorQuote) {
    return "The forecasting model needs both sides of this market from one sportsbook to anchor its forecast. Enter both sides on a game board.";
  }
  const { csv, games } = scheduleHistory(input.schedulePath);
  const cutoff = Date.parse(cutoffIso);
  const history = games.filter((past) => Date.parse(past.kickoff) < cutoff);
  const upcoming = upcomingGameFromCsv(csv, game.id);
  const depthCharts = input.depthChartPath
    ? seasonDepthChart(game.season, input.depthChartPath(game.season))
    : [];
  const starterFor = (team: string): StarterAssumption => {
    const usual = recentStarter(history, team, cutoffIso);
    return starterAssumption(
      starterDecision({
        team,
        season: game.season,
        cutoff: cutoffIso,
        usualStarter: usual?.playerId ?? null,
        depthChart: depthCharts,
        injuries: quarterbackInjuries(evidence),
      }),
      usual?.at ?? null,
    );
  };
  let frozen: ReturnType<typeof freezeProspectiveForecast>;
  try {
    frozen = freezeProspectiveForecast({
      artifact,
      history,
      game: {
        starters: { home: starterFor(game.home), away: starterFor(game.away) },
        id: game.id,
        season: game.season,
        kickoff: game.kickoff,
        home: game.home,
        away: game.away,
        neutral: upcoming?.neutral,
      },
      cutoff: cutoffIso,
      offer,
      anchorQuote,
      policyVersion: POLICY_VERSION,
      weather: weatherSnapshot(game, evidence),
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  const saved: SavedForecast = {
    version: 1,
    provenance: "captured",
    decisionCutoff: frozen.decisionCutoff,
    inputAvailability: INPUT_AVAILABILITY,
    artifact: frozen.artifact,
    features: frozen.features,
    starters: frozen.starters,
    marketEligibility: frozen.marketEligibility,
    probabilities: frozen.probabilities,
    uncertainty: frozen.uncertainty,
    policyVersion: frozen.policyVersion,
    ...(frozen.drivers ? { drivers: frozen.drivers } : {}),
    ...(frozen.weather ? { weather: frozen.weather } : {}),
  };
  return saved;
}

/**
 * Freezes the forecast beside the model result. Archived starters without decision-time
 * evidence stay unknown. Returns null when the model did not compute a forecast.
 */
export function createArtifactForecast(input: {
  artifactPath: string;
  schedulePath: string;
  /** Where npm run data:depth-charts keeps a season's file. Without it every starter is unknown. */
  depthChartPath?: (season: number) => string;
}): ForecastSource {
  return async (game, cutoffIso, offer, model, evidence, anchor) => {
    if (model.status !== "computed") return null;
    if (!existsSync(input.artifactPath) || !existsSync(input.schedulePath)) return null;
    let artifact: ModelArtifact;
    try {
      artifact = parseArtifact(JSON.parse(readFileSync(input.artifactPath, "utf8")) as unknown);
    } catch {
      return null;
    }
    if (artifact.checksum !== model.artifact.checksum) return null;
    const forecast = forecastOffer(input, artifact, game, cutoffIso, offer, evidence, anchor);
    return typeof forecast === "string" ? null : forecast;
  };
}

/** A run's model as the report page may see it: an ineligible model's numbers stay server-side. */
export type DisplayedModel =
  | Extract<RunModel, { status: "unavailable" }>
  | (Omit<Extract<RunModel, { status: "computed" }>, "probabilities"> & {
      probabilities: OutcomeProbabilities | null;
      uncertainty: UncertaintyAssessment;
    });

export function forDisplay(model: RunModel | null): DisplayedModel | null {
  if (model === null || model.status === "unavailable" || model.eligible) return model;
  return {
    ...model,
    probabilities: null,
    uncertainty: {
      available: false,
      reason: "Not shown: the market is not eligible.",
    },
  };
}
