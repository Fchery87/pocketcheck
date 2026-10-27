import {
  decimalToAmerican,
  expectedValue,
  proportionalMargin,
  type OutcomeProbabilities,
} from "#lib/domain/odds.ts";
import type { Market, Offer, SideSelection } from "#lib/domain/offer.ts";
import { VALUE_THRESHOLD } from "#lib/domain/threshold.ts";

/**
 * The model pick calculation's version. It is separate from the research policy version: a
 * saved model pick keeps the version it was graded under, and a grade change needs a new one.
 */
export const MODEL_PICK_VERSION = "model-pick-2026-10-27.1";

export type StrengthGrade = "strong" | "lean" | "no edge";

/** "released" only when the forecasting model's market passed the release gate. */
export type ModelPickRelease = "released" | "unvalidated";

/** Which rule chose the side. */
export type ModelPickTieBreak = "expected value" | "model win probability" | "home or over";

export type ModelPickSideInput = {
  offer: Offer;
  /** The forecasting model's outcome probabilities for this side at its own contract. */
  probabilities: OutcomeProbabilities;
  /** Lower-bound probabilities from the uncertainty assessment, or null when unavailable. */
  conservative: OutcomeProbabilities | null;
};

export type ModelPickInput = {
  market: Market;
  /** Home (or over) first, then away (or under). */
  sides: [ModelPickSideInput, ModelPickSideInput];
  released: boolean;
  materialEvidenceMissing: boolean;
};

export type ModelPickSide = {
  selection: SideSelection;
  pointLine: number | null;
  americanOdds: number;
  decimalOdds: number;
  probabilities: OutcomeProbabilities;
  conservativeProbabilities: OutcomeProbabilities | null;
  /** The sportsbook's implied probability with the margin removed proportionally. */
  noVigProbability: number;
  /** Per unit staked at this side's own price, counting pushes. */
  expectedValue: number;
  /** Null when the uncertainty assessment was unavailable, never an invented zero. */
  conservativeExpectedValue: number | null;
};

/**
 * The worst decimal price at which the picked side keeps its grade (keeps: true), or, for no
 * edge, the price it would need to reach lean (keeps: false). The grade needs a price better
 * than this one.
 */
export type ModelPickPriceCutoff =
  | {
      available: true;
      grade: Exclude<StrengthGrade, "no edge">;
      keeps: boolean;
      decimalOdds: number;
      americanOdds: number;
    }
  | { available: false; reason: string };

export type ModelPickCalculation = {
  version: typeof MODEL_PICK_VERSION;
  market: Market;
  pickedSelection: SideSelection;
  grade: StrengthGrade;
  release: ModelPickRelease;
  tieBreak: ModelPickTieBreak;
  threshold: typeof VALUE_THRESHOLD;
  materialEvidenceMissing: boolean;
  /** Sportsbook margin (overround) across both sides. */
  margin: number;
  /** Home (or over) first, then away (or under). */
  sides: [ModelPickSide, ModelPickSide];
  priceCutoff: ModelPickPriceCutoff;
};

function side(input: ModelPickSideInput, noVig: number): ModelPickSide {
  const { offer } = input;
  return {
    selection: offer.selection,
    pointLine: offer.pointLine,
    americanOdds: offer.americanOdds,
    decimalOdds: offer.decimalOdds,
    probabilities: input.probabilities,
    conservativeProbabilities: input.conservative,
    noVigProbability: noVig,
    expectedValue: expectedValue({
      decimalOdds: offer.decimalOdds,
      probabilities: input.probabilities,
      illustrative: false,
    }).perUnit!,
    conservativeExpectedValue: input.conservative
      ? expectedValue({
          decimalOdds: offer.decimalOdds,
          probabilities: input.conservative,
          illustrative: false,
        }).perUnit!
      : null,
  };
}

/** Decimal price where win * (d - 1) - loss equals the target. */
function breakEvenPrice(probabilities: OutcomeProbabilities, target: number): number | null {
  if (!(probabilities.win > 0)) return null;
  return 1 + (probabilities.loss + target) / probabilities.win;
}

function priceCutoff(picked: ModelPickSide, grade: StrengthGrade): ModelPickPriceCutoff {
  const strong = grade === "strong";
  const probabilities = strong ? picked.conservativeProbabilities : picked.probabilities;
  const target = strong ? VALUE_THRESHOLD.conservativeExpectedValue : 0;
  const decimal = probabilities ? breakEvenPrice(probabilities, target) : null;
  if (decimal === null || !(decimal > 1)) {
    return {
      available: false,
      reason: "The price cutoff is unavailable because the model gives this side no win chance.",
    };
  }
  return {
    available: true,
    grade: strong ? "strong" : "lean",
    keeps: grade !== "no edge",
    decimalOdds: decimal,
    americanOdds: decimalToAmerican(decimal),
  };
}

/**
 * Names a side for one market of a game board and grades it. Pure and deterministic: the
 * higher expected value wins, an exact tie goes to the higher model win probability, and a
 * full tie goes to home (or over) graded no edge.
 */
export function calculateModelPick(input: ModelPickInput): ModelPickCalculation {
  const [first, second] = input.sides;
  const margin = proportionalMargin([
    { side: first.offer.selection, american: first.offer.americanOdds },
    { side: second.offer.selection, american: second.offer.americanOdds },
  ]);
  if (!margin.available) throw new Error("A model pick needs both sides of the market.");
  const sides: [ModelPickSide, ModelPickSide] = [
    side(first, margin.probabilities[first.offer.selection]!),
    side(second, margin.probabilities[second.offer.selection]!),
  ];
  const [home, away] = sides;

  let picked: ModelPickSide;
  let tieBreak: ModelPickTieBreak;
  if (home.expectedValue !== away.expectedValue) {
    picked = home.expectedValue > away.expectedValue ? home : away;
    tieBreak = "expected value";
  } else if (home.probabilities.win !== away.probabilities.win) {
    picked = home.probabilities.win > away.probabilities.win ? home : away;
    tieBreak = "model win probability";
  } else {
    picked = home;
    tieBreak = "home or over";
  }

  let grade: StrengthGrade = "no edge";
  if (tieBreak !== "home or over") {
    const strong =
      !input.materialEvidenceMissing &&
      picked.conservativeExpectedValue !== null &&
      picked.conservativeExpectedValue > VALUE_THRESHOLD.conservativeExpectedValue;
    if (strong) grade = "strong";
    else if (picked.expectedValue > 0) grade = "lean";
  }

  return {
    version: MODEL_PICK_VERSION,
    market: input.market,
    pickedSelection: picked.selection,
    grade,
    release: input.released ? "released" : "unvalidated",
    tieBreak,
    threshold: VALUE_THRESHOLD,
    materialEvidenceMissing: input.materialEvidenceMissing,
    margin: margin.overround,
    sides,
    priceCutoff: priceCutoff(picked, grade),
  };
}
