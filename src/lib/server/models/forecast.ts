import type { OutcomeProbabilities } from "../../domain/odds.ts";
import type { Offer } from "../../domain/offer.ts";
import { anchorFromQuote, type AnchorLine } from "./anchor.ts";
import { valueEligibility, type ModelArtifact } from "./artifact.ts";
import {
  featureRowForGame,
  type FeatureName,
  type FeatureRow,
  type UpcomingGame,
} from "./features.ts";
import type { CompletedGame } from "./games.ts";
import { offerProbabilities } from "./offer-probability.ts";
import type { MeanContributions } from "./fit.ts";
import { predictGame } from "./predict.ts";
import { conservativeProbabilities, type UncertaintyAssessment } from "./uncertainty.ts";

export const FORECAST_RECORD_VERSION = 1;

export const INPUT_AVAILABILITY = {
  version: "decision-time-starters-v1",
  results: "strictly-before-decision-cutoff",
  starters:
    "known and assumed identities require evidence at or before the decision cutoff; archived actual starters without that evidence stay unknown",
} as const;

export type StarterState = "known" | "assumed" | "unknown";

export type StarterSource = "depth chart" | "injury report" | "recent starts";

export type StarterAssumption = {
  state: StarterState;
  identity: string | null;
  evidenceAt: string | null;
  /** What decided the starter. Records frozen before starter sources omit it. */
  source?: StarterSource | null;
  /** Why the starter is unknown, when a source conflict or a gap made it so. */
  reason?: string | null;
};

export type ProspectiveGame = UpcomingGame & {
  homeScore?: number;
  awayScore?: number;
  starters?: { home: StarterAssumption; away: StarterAssumption };
};

export type ProspectiveForecast = {
  version: typeof FORECAST_RECORD_VERSION;
  decisionCutoff: string;
  inputAvailability: typeof INPUT_AVAILABILITY;
  artifact: { checksum: string; version: ModelArtifact["version"] };
  features: FeatureRow["features"];
  featureVersion: typeof FORECAST_RECORD_VERSION;
  starters: { home: StarterAssumption; away: StarterAssumption };
  marketEligibility: { market: Offer["market"]; eligible: boolean };
  probabilities: OutcomeProbabilities;
  uncertainty: UncertaintyAssessment;
  policyVersion: string;
  /** What moved the predicted margin and total, in points. Records frozen earlier omit it. */
  drivers?: { margin: MeanContributions; total: MeanContributions };
  /** The line the forecast started from. Records frozen before anchoring omit it. */
  anchor?: AnchorLine;
  /**
   * The kickoff weather the total could have used. Points stay 0 until prospectively saved
   * snapshots are enough to fit an adjustment. A dome never applies weather, and a missing
   * outdoor forecast is a gap, not zero wind.
   */
  weather?: WeatherAdjustment;
};

export type ForecastInputs = {
  artifact: ModelArtifact;
  history: readonly CompletedGame[];
  game: ProspectiveGame;
  cutoff: string;
  offer: Offer;
  policyVersion: string;
  /** Both sides from one sportsbook. Without it the market has no forecast. */
  anchorQuote?: { homeAmerican: number; awayAmerican: number; line?: number };
  /** The kickoff forecast already collected. Omitted means no weather was considered. */
  weather?: WeatherSnapshot | null;
};

/** The kickoff forecast collected at analysis time. Null fields were not in the snapshot. */
export type WeatherSnapshot = {
  roof: "outdoors" | "dome" | "closed" | "open" | "retractable" | "unknown";
  windMph?: number | null;
  precipitationChance?: number | null;
  temperatureF?: number | null;
  /** When the forecast was issued. Null means it was never collected. */
  observedAt: string | null;
};

export type WeatherAdjustment = {
  /** Always false until prospectively saved snapshots can be fit. A number is not invented. */
  applied: false;
  /** Points added to the total. Zero while unfitted, and zero under a roof. */
  points: 0;
  reason: "roof" | "missing" | "unfitted";
  snapshot: {
    windMph: number | null;
    precipitationChance: number | null;
    temperatureF: number | null;
  } | null;
  version: "weather-unfitted-v1";
};

const CLOSED_ROOF = new Set(["dome", "closed"]);

/** Records the snapshot and applies nothing. A missing outdoor forecast is a gap, not calm weather. */
export function weatherAdjustment(snapshot: WeatherSnapshot | null | undefined): WeatherAdjustment {
  if (!snapshot || CLOSED_ROOF.has(snapshot.roof)) {
    return {
      applied: false,
      points: 0,
      reason: "roof",
      snapshot: null,
      version: "weather-unfitted-v1",
    };
  }
  const recorded = {
    windMph: snapshot.windMph ?? null,
    precipitationChance: snapshot.precipitationChance ?? null,
    temperatureF: snapshot.temperatureF ?? null,
  };
  const missing = !snapshot.observedAt || Object.values(recorded).every((value) => value === null);
  return {
    applied: false,
    points: 0,
    reason: missing ? "missing" : "unfitted",
    snapshot: missing ? null : recorded,
    version: "weather-unfitted-v1",
  };
}

const UNKNOWN: StarterAssumption = {
  state: "unknown",
  identity: null,
  evidenceAt: null,
};

function starterFor(recorded: StarterAssumption | undefined, cutoff: string): StarterAssumption {
  if (recorded?.state === "unknown" && recorded.reason) {
    return { ...UNKNOWN, reason: recorded.reason };
  }
  if (!recorded || recorded.state === "unknown" || !recorded.identity || !recorded.evidenceAt) {
    return UNKNOWN;
  }
  if (Date.parse(recorded.evidenceAt) > Date.parse(cutoff)) return UNKNOWN;
  if (recorded.state !== "known" && recorded.state !== "assumed") return UNKNOWN;
  return {
    state: recorded.state,
    identity: recorded.identity,
    evidenceAt: recorded.evidenceAt,
    ...(recorded.source ? { source: recorded.source } : {}),
  };
}

/** Freeze the inputs and probabilities available at the decision cutoff. */
export function freezeProspectiveForecast(input: ForecastInputs): ProspectiveForecast {
  const home = starterFor(input.game.starters?.home, input.cutoff);
  const away = starterFor(input.game.starters?.away, input.cutoff);
  const game: UpcomingGame = {
    id: input.game.id,
    season: input.game.season,
    kickoff: input.game.kickoff,
    home: input.game.home,
    away: input.game.away,
    ...(input.game.neutral ? { neutral: true } : {}),
    ...(home.state === "known" || home.state === "assumed" ? { homeQb: home.identity! } : {}),
    ...(away.state === "known" || away.state === "assumed" ? { awayQb: away.identity! } : {}),
  };
  const row = featureRowForGame(
    input.history,
    game,
    input.artifact.featureParameters,
    input.cutoff,
  );
  if (!input.anchorQuote) {
    throw new Error(
      `${input.offer.market} has no two-sided quote, so it has no anchor line and no forecast.`,
    );
  }
  const anchor = anchorFromQuote(
    input.offer.market,
    { ...input.anchorQuote, sportsbook: input.offer.sportsbook },
    input.artifact.margin.residuals,
  );
  const unanchored = predictGame(input.artifact, row);
  const adjustment =
    input.offer.market === "total"
      ? unanchored.drivers.total.contributions.reduce((sum, item) => sum + item.points, 0)
      : unanchored.drivers.margin.contributions.reduce((sum, item) => sum + item.points, 0);
  const predicted = predictGame(
    input.artifact,
    row,
    input.offer.market === "total"
      ? { totalMean: anchor.mean + adjustment }
      : { marginMean: anchor.mean + adjustment },
  );
  const probabilities = offerProbabilities(predicted, input.offer);
  const eligibility = valueEligibility(input.artifact, input.offer.market);
  return {
    version: FORECAST_RECORD_VERSION,
    decisionCutoff: input.cutoff,
    inputAvailability: INPUT_AVAILABILITY,
    artifact: {
      checksum: input.artifact.checksum,
      version: input.artifact.version,
    },
    features: row.features,
    featureVersion: FORECAST_RECORD_VERSION,
    starters: { home, away },
    marketEligibility: {
      market: input.offer.market,
      eligible: eligibility.eligible,
    },
    probabilities,
    uncertainty: conservativeProbabilities(
      input.artifact.uncertainty,
      input.offer.market,
      probabilities,
    ),
    policyVersion: input.policyVersion,
    drivers: predicted.drivers,
    anchor,
    ...(input.weather !== undefined ? { weather: weatherAdjustment(input.weather) } : {}),
  };
}

/** Later schedules, artifacts, starters, scores, and policies cannot replace a frozen forecast. */
export function replayProspectiveForecast(
  saved: ProspectiveForecast,
  _current: ForecastInputs,
): ProspectiveForecast {
  return structuredClone(saved);
}

export type { FeatureName };
