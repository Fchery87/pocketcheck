import { expectedValue, type OutcomeProbabilities } from "#lib/domain/odds.ts";
import { VALUE_THRESHOLD } from "#lib/domain/threshold.ts";
import type { ReleaseStatus } from "../models/artifact.ts";
import type { UncertaintyAssessment } from "../models/uncertainty.ts";
import type { ManualCoverage } from "./coverage.ts";

export const POLICY_VERSION = "policy-2026-10-25.2";

export const POLICY_CONCLUSIONS = [
  "pass",
  "wait",
  "insufficient evidence",
  "experimental lean",
  "experimental value candidate",
] as const;

export type PolicyConclusion = (typeof POLICY_CONCLUSIONS)[number];

export type PolicyInput = {
  offerValid: boolean;
  gameStarted: boolean;
  materialEvidenceMissing: boolean;
  /** Gaps that fresh, tagged manual evidence cleared. */
  manualCoverage: ManualCoverage[];
  releaseStatus: ReleaseStatus;
  /** Why the model is not eligible, shown when releaseStatus is not released. */
  releaseReason?: string;
  probabilities: OutcomeProbabilities | null;
  /** Conservative probabilities from the artifact's calibration. Assessed only for an eligible model. */
  uncertainty: UncertaintyAssessment;
  decimalOdds: number;
};

export type PolicyDecision = {
  policyVersion: typeof POLICY_VERSION;
  conclusion: PolicyConclusion;
  experimental: true;
  blockingReason: string | null;
  expectedValuePerUnit: number | null;
  conservativeExpectedValuePerUnit: number | null;
  threshold: typeof VALUE_THRESHOLD;
  uncertainty: UncertaintyAssessment;
  manualCoverage: ManualCoverage[];
  reliesOnManualEvidence: boolean;
  priceCutoff:
    | { available: false; reason: string }
    | { available: true; decimalMinimum: number; conservativeExpectedValue: number };
  label: "Experimental estimate. Not proof of an edge. Thresholds in this policy are versioned and are not scientifically established.";
};

function finiteProbabilities(
  probabilities: OutcomeProbabilities | null,
): probabilities is OutcomeProbabilities {
  if (probabilities === null) return false;
  return [probabilities.win, probabilities.loss, probabilities.push].every(Number.isFinite);
}

function priceCutoff(uncertainty: UncertaintyAssessment): PolicyDecision["priceCutoff"] {
  if (!uncertainty.available) {
    return { available: false, reason: `Price cutoff is unavailable: ${uncertainty.reason}` };
  }
  const { win, loss } = uncertainty.probabilities;
  if (!(win > 0)) {
    return {
      available: false,
      reason: "Price cutoff is unavailable because the conservative win probability is zero.",
    };
  }
  const target = VALUE_THRESHOLD.conservativeExpectedValue;
  return {
    available: true,
    decimalMinimum: 1 + (loss + target) / win,
    conservativeExpectedValue: target,
  };
}

export function decidePolicy(input: PolicyInput): PolicyDecision {
  const base: Omit<PolicyDecision, "conclusion" | "blockingReason" | "expectedValuePerUnit"> = {
    policyVersion: POLICY_VERSION,
    experimental: true as const,
    conservativeExpectedValuePerUnit: null,
    threshold: VALUE_THRESHOLD,
    uncertainty: input.uncertainty,
    manualCoverage: input.manualCoverage,
    reliesOnManualEvidence: input.manualCoverage.length > 0,
    priceCutoff: priceCutoff(input.uncertainty),
    label:
      "Experimental estimate. Not proof of an edge. Thresholds in this policy are versioned and are not scientifically established." as const,
  };

  if (!input.offerValid) {
    return {
      ...base,
      conclusion: "pass",
      blockingReason: "The offer is not valid.",
      expectedValuePerUnit: null,
    };
  }
  if (input.gameStarted) {
    return {
      ...base,
      conclusion: "pass",
      blockingReason: "The game has already started.",
      expectedValuePerUnit: null,
    };
  }
  if (input.materialEvidenceMissing) {
    return {
      ...base,
      conclusion: "insufficient evidence",
      blockingReason: "Material evidence is missing.",
      expectedValuePerUnit: null,
    };
  }
  if (input.releaseStatus !== "released-experimental") {
    return {
      ...base,
      conclusion: "insufficient evidence",
      blockingReason:
        input.releaseReason ??
        "The model artifact is unreleased and is not eligible for a value recommendation.",
      expectedValuePerUnit: null,
    };
  }
  if (!finiteProbabilities(input.probabilities)) {
    return {
      ...base,
      conclusion: "insufficient evidence",
      blockingReason:
        "Outcome probabilities are missing or not finite. Missing expected value is unavailable, not zero.",
      expectedValuePerUnit: null,
    };
  }

  const value = expectedValue({
    decimalOdds: input.decimalOdds,
    probabilities: input.probabilities,
    illustrative: false,
  });

  if (value.perUnit === null) {
    return {
      ...base,
      conclusion: "insufficient evidence",
      blockingReason: "Expected value is unavailable. Missing expected value is not zero.",
      expectedValuePerUnit: null,
    };
  }

  if (value.perUnit <= 0) {
    return {
      ...base,
      conclusion: "pass",
      blockingReason:
        "The released artifact does not show positive expected value at the recorded price.",
      expectedValuePerUnit: value.perUnit,
    };
  }
  if (!input.uncertainty.available) {
    return {
      ...base,
      conclusion: "insufficient evidence",
      blockingReason: `Uncertainty assessment unavailable: ${input.uncertainty.reason}`,
      expectedValuePerUnit: value.perUnit,
    };
  }
  const conservative = expectedValue({
    decimalOdds: input.decimalOdds,
    probabilities: input.uncertainty.probabilities,
    illustrative: false,
  }).perUnit!;
  const confidence = `${Math.round(input.uncertainty.confidence * 100)}%`;
  if (conservative <= VALUE_THRESHOLD.conservativeExpectedValue) {
    return {
      ...base,
      conclusion: "experimental lean",
      blockingReason: `Positive point estimate, but the conservative estimate at ${confidence} confidence is ${conservative.toFixed(4)} units, not above the ${VALUE_THRESHOLD.conservativeExpectedValue} threshold (${VALUE_THRESHOLD.version}).`,
      expectedValuePerUnit: value.perUnit,
      conservativeExpectedValuePerUnit: conservative,
    };
  }
  return {
    ...base,
    conclusion: "experimental value candidate",
    blockingReason: null,
    expectedValuePerUnit: value.perUnit,
    conservativeExpectedValuePerUnit: conservative,
  };
}
