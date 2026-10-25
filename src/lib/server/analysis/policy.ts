import { expectedValue, type OutcomeProbabilities } from "#lib/domain/odds.ts";
import type { ReleaseStatus } from "../models/artifact.ts";

export const POLICY_VERSION = "policy-2026-10-25";

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
  releaseStatus: ReleaseStatus;
  probabilities: OutcomeProbabilities | null;
  decimalOdds: number;
  /** Named target expected value per unit. Not a scientifically established edge threshold. */
  targetExpectedValue?: number;
};

export type PolicyDecision = {
  policyVersion: typeof POLICY_VERSION;
  conclusion: PolicyConclusion;
  experimental: true;
  blockingReason: string | null;
  expectedValuePerUnit: number | null;
  priceCutoff: { available: false; reason: string } | { available: true; decimalMinimum: number; targetExpectedValue: number };
  label: "Experimental estimate. Not proof of an edge. Thresholds in this policy are versioned and are not scientifically established.";
};

function finiteProbabilities(probabilities: OutcomeProbabilities | null): probabilities is OutcomeProbabilities {
  if (probabilities === null) return false;
  return [probabilities.win, probabilities.loss, probabilities.push].every(Number.isFinite);
}

function priceCutoff(probabilities: OutcomeProbabilities | null, target: number | undefined): PolicyDecision["priceCutoff"] {
  if (!finiteProbabilities(probabilities)) {
    return { available: false, reason: "Price cutoff is unavailable because outcome probabilities are missing or not finite." };
  }
  if (target === undefined || !Number.isFinite(target)) {
    return { available: false, reason: "Price cutoff is unavailable because no target expected value was supplied." };
  }
  if (!(probabilities.win > 0)) {
    return { available: false, reason: "Price cutoff is unavailable because the win probability is not greater than zero." };
  }
  return {
    available: true,
    decimalMinimum: 1 + (probabilities.loss + target) / probabilities.win,
    targetExpectedValue: target,
  };
}

export function decidePolicy(input: PolicyInput): PolicyDecision {
  const cutoff = priceCutoff(input.probabilities, input.targetExpectedValue);
  const base: Omit<PolicyDecision, "conclusion" | "blockingReason" | "expectedValuePerUnit"> = {
    policyVersion: POLICY_VERSION,
    experimental: true as const,
    priceCutoff: cutoff,
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
      blockingReason: "The model artifact is unreleased and is not eligible for a value recommendation.",
      expectedValuePerUnit: null,
    };
  }
  if (!finiteProbabilities(input.probabilities)) {
    return {
      ...base,
      conclusion: "insufficient evidence",
      blockingReason: "Outcome probabilities are missing or not finite. Missing expected value is unavailable, not zero.",
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

  if (value.perUnit > 0) {
    return {
      ...base,
      conclusion: "experimental value candidate",
      blockingReason: null,
      expectedValuePerUnit: value.perUnit,
    };
  }

  return {
    ...base,
    conclusion: "experimental lean",
    blockingReason: "The released artifact does not show positive expected value at the recorded price.",
    expectedValuePerUnit: value.perUnit,
  };
}
