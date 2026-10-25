export type AmericanPrice = number;

export class PriceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PriceError";
  }
}

export function americanToDecimal(american: AmericanPrice): number {
  if (!Number.isFinite(american) || american === 0 || (american > 0 && american < 100)) {
    throw new PriceError(`Invalid American price: ${american}`);
  }
  if (american > 0) {
    return 1 + american / 100;
  }
  return 1 + 100 / Math.abs(american);
}

export function decimalToAmerican(decimalOdds: number): number {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    throw new PriceError(`Invalid decimal odds: ${decimalOdds}`);
  }
  const net = decimalOdds - 1;
  if (net >= 1) {
    return Math.round(net * 100);
  }
  return -Math.round(100 / net);
}

export function breakEven(decimalOdds: number): {
  decisive: number;
  unconditionalWinsAt: (pushProbability: number) => number;
} {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) {
    throw new PriceError(`Invalid decimal odds: ${decimalOdds}`);
  }
  const decisive = 1 / decimalOdds;
  return {
    decisive,
    unconditionalWinsAt(pushProbability: number) {
      if (!Number.isFinite(pushProbability) || pushProbability < 0 || pushProbability >= 1) {
        throw new PriceError(`Invalid push probability: ${pushProbability}`);
      }
      return (1 - pushProbability) / decimalOdds;
    },
  };
}

export type OutcomeProbabilities = {
  win: number;
  loss: number;
  push: number;
};

export function expectedValue(input: {
  decimalOdds: number;
  probabilities: OutcomeProbabilities | null;
  illustrative: boolean;
}): { perUnit: number | null; illustrative: boolean } {
  if (input.probabilities === null) {
    return { perUnit: null, illustrative: input.illustrative };
  }
  const { win, loss, push } = input.probabilities;
  const sum = win + loss + push;
  if (![win, loss, push, sum].every(Number.isFinite) || Math.abs(sum - 1) > 1e-9) {
    throw new PriceError("Outcome probabilities must be finite and sum to 1");
  }
  if (win < 0 || loss < 0 || push < 0) {
    throw new PriceError("Outcome probabilities cannot be negative");
  }
  return {
    perUnit: win * (input.decimalOdds - 1) - loss,
    illustrative: input.illustrative,
  };
}

export type PricedSide = {
  side: string;
  american: AmericanPrice;
};

export type MarginEstimate =
  | {
      available: true;
      assumption: "proportional";
      overround: number;
      probabilities: Record<string, number>;
    }
  | {
      available: false;
      reason: "missing-complement" | "not-comparable";
    };

export function proportionalMargin(sides: PricedSide[]): MarginEstimate {
  if (sides.length < 2) {
    return { available: false, reason: "missing-complement" };
  }
  const implied = sides.map((side) => ({
    side: side.side,
    probability: 1 / americanToDecimal(side.american),
  }));
  const sum = implied.reduce((total, side) => total + side.probability, 0);
  const probabilities: Record<string, number> = {};
  for (const side of implied) {
    probabilities[side.side] = side.probability / sum;
  }
  return {
    available: true,
    assumption: "proportional",
    overround: sum - 1,
    probabilities,
  };
}

export function unitReturn(input: {
  result: "win" | "loss" | "push" | "void";
  stake: number;
  decimalOdds: number;
}): number {
  if (!Number.isFinite(input.stake) || input.stake < 0) {
    throw new PriceError(`Invalid stake: ${input.stake}`);
  }
  if (input.result === "win") {
    return input.stake * (input.decimalOdds - 1);
  }
  if (input.result === "loss") {
    return -input.stake;
  }
  return 0;
}
