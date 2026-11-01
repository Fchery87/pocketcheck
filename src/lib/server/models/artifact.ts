import { createHash } from "node:crypto";
import type { ResidualDistribution, SideProbability } from "./distribution.ts";
import { FEATURE_DEFINITIONS, type FeatureParameters } from "./features.ts";
import type { FitParameters, LinearModel } from "./fit.ts";
import type { CHRONOLOGY, Market } from "./games.ts";
import type { ArtifactUncertainty } from "./uncertainty.ts";
import { hasVerifiedRelease, type VerifiedReleaseAttestation } from "./release.ts";

export type ReleaseStatus = "unreleased" | "released-experimental";

export type ModelArtifact = {
  kind: "pocketcheck-baseline";
  version: 7;
  /** The training code that built this artifact. See TRAINING_CODE. */
  trainingCode: string;
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
  /**
   * How much of each fitted adjustment is kept, fitted on walk-forward predictions inside the
   * training window. The stored coefficients are already scaled by it. Absent on older artifacts.
   */
  shrink?: { margin: number; total: number };
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

export function artifactChecksum(artifact: Omit<ModelArtifact, "checksum">): string {
  return createHash("sha256").update(JSON.stringify(artifact)).digest("hex");
}

export function withChecksum(artifact: Omit<ModelArtifact, "checksum">): ModelArtifact {
  return { ...artifact, checksum: artifactChecksum(artifact) };
}

export function valueEligibility(
  artifact: Pick<ModelArtifact, "releaseStatus" | "releasedMarkets"> &
    Partial<Pick<ModelArtifact, "checksum">>,
  market: Market,
  attestation?: VerifiedReleaseAttestation,
): ValueEligibility {
  if (!hasVerifiedRelease(attestation, artifact.checksum, market)) {
    return {
      eligible: false,
      reason:
        "A verified release attestation for this artifact and market is required for a value recommendation.",
    };
  }
  return {
    eligible: true,
    reason: `Released experimental artifact may be assessed for the ${market} market by the value policy.`,
  };
}
