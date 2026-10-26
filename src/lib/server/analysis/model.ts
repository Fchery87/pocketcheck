import { existsSync, readFileSync } from "node:fs";
import type { OutcomeProbabilities } from "#lib/domain/odds.ts";
import type { Offer } from "#lib/domain/offer.ts";
import { artifactChecksum, valueEligibility, type ModelArtifact } from "../models/artifact.ts";
import { featureRowForGame } from "../models/features.ts";
import type { Market } from "../models/games.ts";
import { pricedGamesFromNflverseCsv, upcomingGameFromCsv } from "../models/history.ts";
import { offerProbabilities } from "../models/offer-probability.ts";
import { predictGame } from "../models/predict.ts";
import type { ScheduledGame } from "../sources/contracts.ts";

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
      eligible: boolean;
      reason: string;
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

const SUPPORTED_VERSION = 4;

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
      return unavailable(`No model artifact at ${input.artifactPath}. Run npm run model:fit.`);
    }
    const artifact = JSON.parse(readFileSync(input.artifactPath, "utf8")) as ModelArtifact;
    const { checksum, ...body } = artifact;
    if (artifactChecksum(body) !== checksum) {
      return unavailable("The model artifact's checksum does not match its contents.");
    }
    if (artifact.version !== SUPPORTED_VERSION) {
      return unavailable(
        `Model artifact version ${artifact.version} is not supported. Refit with npm run model:fit.`,
      );
    }
    if (Date.parse(game.kickoff) <= Date.parse(artifact.trainingCutoff)) {
      return unavailable(
        `The model artifact was trained on games through ${artifact.trainingCutoff}, which includes this game.`,
      );
    }
    if (!existsSync(input.schedulePath)) {
      return unavailable(`No schedule at ${input.schedulePath}. Run npm run data:schedule.`);
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
    const row = featureRowForGame(history, upcoming, artifact.featureParameters);
    const probabilities = offerProbabilities(predictGame(artifact, row), offer);
    const eligibility = valueEligibility(artifact, offer.market);
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
      eligible: eligibility.eligible,
      reason: eligibility.reason,
    };
  };
}

/** A run's model as the report page may see it: an ineligible model's numbers stay server-side. */
export type DisplayedModel =
  | Extract<RunModel, { status: "unavailable" }>
  | (Omit<Extract<RunModel, { status: "computed" }>, "probabilities"> & {
      probabilities: OutcomeProbabilities | null;
    });

export function forDisplay(model: RunModel | null): DisplayedModel | null {
  if (model === null || model.status === "unavailable" || model.eligible) return model;
  return { ...model, probabilities: null };
}
