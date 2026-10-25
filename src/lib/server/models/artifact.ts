import { createHash } from "node:crypto";
import type { ResidualDistribution, SideProbability } from "./distribution.ts";
import { FEATURE_DEFINITIONS, type FeatureParameters } from "./features.ts";
import type { FitParameters, LinearModel } from "./fit.ts";

export type ReleaseStatus = "unreleased" | "released-experimental";

export type ModelArtifact = {
  kind: "pocketcheck-baseline";
  version: 2;
  releaseStatus: ReleaseStatus;
  datasetHash: string;
  trainingCutoff: string;
  featureDefinitions: typeof FEATURE_DEFINITIONS;
  featureParameters: FeatureParameters;
  /** walk-forward when the training window is large enough, otherwise in-sample. */
  residualSource: "walk-forward" | "in-sample";
  fitParameters: FitParameters;
  /** Outcome rates in the training window, for the base-rate baseline. */
  baseRates: { moneyline: SideProbability };
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

export function artifactChecksum(artifact: Omit<ModelArtifact, "checksum">): string {
  return createHash("sha256").update(JSON.stringify(artifact)).digest("hex");
}

export function withChecksum(artifact: Omit<ModelArtifact, "checksum">): ModelArtifact {
  return { ...artifact, checksum: artifactChecksum(artifact) };
}

export function valueEligibility(artifact: Pick<ModelArtifact, "releaseStatus">): ValueEligibility {
  if (artifact.releaseStatus !== "released-experimental") {
    return {
      eligible: false,
      reason: "Unreleased artifacts are not eligible for a value recommendation.",
    };
  }
  return {
    eligible: true,
    reason: "Released experimental artifact may be assessed by a later value policy.",
  };
}
