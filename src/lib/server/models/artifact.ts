import { createHash } from "node:crypto";
import type { ResidualDistribution, SideProbability } from "./distribution.ts";
import { FEATURE_DEFINITIONS, type FeatureParameters } from "./features.ts";
import type { FitParameters, LinearModel } from "./fit.ts";
import type { CHRONOLOGY, Market } from "./games.ts";
import type { ArtifactUncertainty } from "./uncertainty.ts";

export type ReleaseStatus = "unreleased" | "released-experimental";

export type ModelArtifact = {
  kind: "pocketcheck-baseline";
  version: 5;
  /** How the forecast starts. The fit learns only the deviation from this mean. */
  anchor: {
    definition: string;
    history: "recorded close";
    decisionTime: "one sportsbook's two sides";
    /** Training rows with no recorded close, counted and excluded. */
    excludedNoClose: { moneyline: number; spread: number; total: number };
  };
  releaseStatus: ReleaseStatus;
  /** Markets that passed the release gate. Empty while unreleased. */
  releasedMarkets: Market[];
  datasetHash: string;
  trainingCutoff: string;
  chronology: typeof CHRONOLOGY;
  featureDefinitions: typeof FEATURE_DEFINITIONS;
  featureParameters: FeatureParameters;
  /** walk-forward when the training window is large enough, otherwise in-sample. */
  residualSource: "walk-forward" | "in-sample";
  fitParameters: FitParameters;
  /** Outcome rates in the training window, for the base-rate baseline. */
  baseRates: { moneyline: SideProbability };
  /** Walk-forward calibration per market, for the conservative probabilities the value policy needs. */
  uncertainty: ArtifactUncertainty;
  margin: { model: LinearModel; residuals: ResidualDistribution };
  total: { model: LinearModel; residuals: ResidualDistribution };
  checksum: string;
};

export type ValueEligibility = {
  eligible: boolean;
  reason: string;
};

export function datasetHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function artifactChecksum(
  artifact: Omit<ModelArtifact, "checksum">,
): string {
  return createHash("sha256").update(JSON.stringify(artifact)).digest("hex");
}

export function withChecksum(
  artifact: Omit<ModelArtifact, "checksum">,
): ModelArtifact {
  return { ...artifact, checksum: artifactChecksum(artifact) };
}

export function valueEligibility(
  artifact: Pick<ModelArtifact, "releaseStatus" | "releasedMarkets">,
  market: Market,
): ValueEligibility {
  if (artifact.releaseStatus !== "released-experimental") {
    return {
      eligible: false,
      reason:
        "Unreleased artifacts are not eligible for a value recommendation.",
    };
  }
  if (!artifact.releasedMarkets.includes(market)) {
    return {
      eligible: false,
      reason: `The artifact did not pass the release gate for the ${market} market.`,
    };
  }
  return {
    eligible: true,
    reason: `Released experimental artifact may be assessed for the ${market} market by the value policy.`,
  };
}
