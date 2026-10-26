import { existsSync, readFileSync } from "node:fs";
import type { OutcomeProbabilities } from "#lib/domain/odds.ts";
import type { Offer } from "#lib/domain/offer.ts";
import { valueEligibility, type ModelArtifact } from "../models/artifact.ts";
import { PROSPECTIVE_PROTOCOL } from "../models/release.ts";
import { parseArtifact } from "../models/inputs.ts";
import { featureRowForGame } from "../models/features.ts";
import {
  freezeProspectiveForecast,
  INPUT_AVAILABILITY,
} from "../models/forecast.ts";
import type { Market } from "../models/games.ts";
import {
  pricedGamesFromNflverseCsv,
  upcomingGameFromCsv,
} from "../models/history.ts";
import { offerProbabilities } from "../models/offer-probability.ts";
import { predictGame } from "../models/predict.ts";
import type { ScheduledGame } from "../sources/contracts.ts";
import {
  conservativeProbabilities,
  type UncertaintyAssessment,
} from "../models/uncertainty.ts";
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
}): ModelSource {
  return async (game, cutoffIso, offer) => {
    if (!existsSync(input.artifactPath)) {
      return unavailable(
        `No model artifact at ${input.artifactPath}. Run npm run model:fit.`,
      );
    }
    let artifact: ModelArtifact;
    try {
      const value: unknown = JSON.parse(
        readFileSync(input.artifactPath, "utf8"),
      );
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
      return unavailable(
        "The model artifact was trained after this research decision cutoff.",
      );
    }
    if (!existsSync(input.schedulePath)) {
      return unavailable(
        `No schedule at ${input.schedulePath}. Run npm run data:schedule.`,
      );
    }
    const csv = readFileSync(input.schedulePath, "utf8");
    const cutoff = Date.parse(cutoffIso);
    const history = pricedGamesFromNflverseCsv(csv).filter(
      (past) => Date.parse(past.kickoff) < cutoff,
    );
    const upcoming = upcomingGameFromCsv(csv, game.id) ?? {
      id: game.id,
      season: game.season,
      kickoff: game.kickoff,
      home: game.home,
      away: game.away,
    };
    const row = featureRowForGame(
      history,
      upcoming,
      artifact.featureParameters,
      cutoffIso,
    );
    const probabilities = offerProbabilities(predictGame(artifact, row), offer);
    const uncertainty = conservativeProbabilities(
      artifact.uncertainty,
      offer.market,
      probabilities,
    );
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

/**
 * Freezes the forecast beside the model result. Archived starters without decision-time
 * evidence stay unknown. Returns null when the model did not compute a forecast.
 */
export function createArtifactForecast(input: {
  artifactPath: string;
  schedulePath: string;
}): ForecastSource {
  return async (game, cutoffIso, offer, model) => {
    if (model.status !== "computed") return null;
    if (!existsSync(input.artifactPath) || !existsSync(input.schedulePath))
      return null;
    let artifact: ModelArtifact;
    try {
      artifact = parseArtifact(
        JSON.parse(readFileSync(input.artifactPath, "utf8")) as unknown,
      );
    } catch {
      return null;
    }
    if (artifact.checksum !== model.artifact.checksum) return null;
    const csv = readFileSync(input.schedulePath, "utf8");
    const cutoff = Date.parse(cutoffIso);
    const history = pricedGamesFromNflverseCsv(csv).filter(
      (past) => Date.parse(past.kickoff) < cutoff,
    );
    const upcoming = upcomingGameFromCsv(csv, game.id);
    const frozen = freezeProspectiveForecast({
      artifact,
      history,
      game: {
        id: game.id,
        season: game.season,
        kickoff: game.kickoff,
        home: game.home,
        away: game.away,
        neutral: upcoming?.neutral,
      },
      cutoff: cutoffIso,
      offer,
      policyVersion: POLICY_VERSION,
    });
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
    };
    return saved;
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
  if (model === null || model.status === "unavailable" || model.eligible)
    return model;
  return {
    ...model,
    probabilities: null,
    uncertainty: {
      available: false,
      reason: "Not shown: the market is not eligible.",
    },
  };
}
