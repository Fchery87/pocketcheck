import { expectedValue, type OutcomeProbabilities } from "#lib/domain/odds.ts";

export type SensitivityResult = {
  experimental: true;
  label: "Experimental sensitivity. A stated probability shift is not proof of an edge.";
  before: number | null;
  after: number | null;
  shift: { win: number; loss: number; push: number } | null;
  unavailableReason: string | null;
};

function shifted(probabilities: OutcomeProbabilities, shift: number): OutcomeProbabilities {
  const win = probabilities.win + shift;
  const loss = probabilities.loss - shift;
  return { win, loss, push: probabilities.push };
}

/** Shows expected value before and after a stated win-probability shift. Not proof of edge. */
export function sensitivity(input: {
  decimalOdds: number;
  probabilities: OutcomeProbabilities | null;
  /** Added to win probability and removed from loss probability. */
  winProbabilityShift: number;
}): SensitivityResult {
  const label = "Experimental sensitivity. A stated probability shift is not proof of an edge." as const;
  if (input.probabilities === null || !Number.isFinite(input.winProbabilityShift)) {
    return {
      experimental: true,
      label,
      before: null,
      after: null,
      shift: null,
      unavailableReason: "Sensitivity is unavailable because probabilities or the stated shift are missing.",
    };
  }
  const before = expectedValue({
    decimalOdds: input.decimalOdds,
    probabilities: input.probabilities,
    illustrative: true,
  }).perUnit;
  const next = shifted(input.probabilities, input.winProbabilityShift);
  if (next.win < 0 || next.loss < 0 || next.push < 0) {
    return {
      experimental: true,
      label,
      before,
      after: null,
      shift: null,
      unavailableReason: "The stated shift would make an outcome probability negative, so the shifted estimate is unavailable.",
    };
  }
  const after = expectedValue({
    decimalOdds: input.decimalOdds,
    probabilities: next,
    illustrative: true,
  }).perUnit;
  return {
    experimental: true,
    label,
    before,
    after,
    shift: { win: input.winProbabilityShift, loss: -input.winProbabilityShift, push: 0 },
    unavailableReason: null,
  };
}

/** Decimal minimum for target expected value e: 1 + (pLoss + e) / pWin. Unavailable when probabilities are missing. */
export function decimalPriceCutoff(input: {
  probabilities: OutcomeProbabilities | null;
  targetExpectedValue: number;
}): { available: true; decimalMinimum: number } | { available: false; reason: string } {
  if (input.probabilities === null || ![input.probabilities.win, input.probabilities.loss, input.probabilities.push].every(Number.isFinite)) {
    return { available: false, reason: "Price cutoff is unavailable because outcome probabilities are missing." };
  }
  if (!(input.probabilities.win > 0) || !Number.isFinite(input.targetExpectedValue)) {
    return { available: false, reason: "Price cutoff is unavailable because the win probability or target is not usable." };
  }
  return {
    available: true,
    decimalMinimum: 1 + (input.probabilities.loss + input.targetExpectedValue) / input.probabilities.win,
  };
}
