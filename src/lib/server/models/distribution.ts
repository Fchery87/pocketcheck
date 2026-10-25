export type MassBin = {
  points: number;
  probability: number;
};

/** Multiplies the smooth mass on one integer outcome. Outcomes not listed keep weight 1. */
export type KeyWeight = {
  points: number;
  weight: number;
};

export type ResidualDistribution = {
  residuals: number[];
  bandwidth: number;
  support: { min: number; max: number };
  keyWeights: KeyWeight[];
};

const MIN_SUPPORT = 21;

/**
 * bandwidth smooths the margin histogram enough to wash out key numbers. pseudoCount shrinks
 * each weight toward 1, so a margin needs real evidence to move. Margins past maxAbs keep weight 1.
 */
export const KEY_NUMBER_SMOOTHING = {
  bandwidth: 3,
  pseudoCount: 5,
  maxAbs: 40,
};

/**
 * How much more or less often each integer margin happens than a smooth curve through the
 * margin histogram predicts. Margins are pooled by absolute value, so 3 and -3 share a weight.
 * NFL margins cluster on 3 and 7 and almost never tie, which a smoothed residual curve misses.
 */
export function keyNumberWeights(
  margins: readonly number[],
  options = KEY_NUMBER_SMOOTHING,
): KeyWeight[] {
  const { bandwidth, pseudoCount, maxAbs } = options;
  // Count outcomes a little past maxAbs so the smooth curve near the edge has neighbors.
  const reach = maxAbs + Math.ceil(4 * bandwidth);
  const counts = new Map<number, number>();
  for (const margin of margins) {
    const points = Math.round(margin);
    counts.set(points, (counts.get(points) ?? 0) + 1);
  }
  const kernelMass = Array.from({ length: 2 * reach + 1 }, (_, index) =>
    kernel(index - reach, bandwidth),
  );
  const kernelTotal = kernelMass.reduce((sum, value) => sum + value, 0);
  const smooth = (points: number) => {
    let value = 0;
    for (let offset = -reach; offset <= reach; offset += 1) {
      value += (counts.get(points - offset) ?? 0) * (kernelMass[offset + reach] ?? 0);
    }
    return value / kernelTotal;
  };
  const pooled = (points: number, of: (points: number) => number) =>
    points === 0 ? of(0) : of(points) + of(-points);

  const weights: KeyWeight[] = [];
  for (let points = 0; points <= maxAbs; points += 1) {
    const observed = pooled(points, (value) => counts.get(value) ?? 0);
    const expected = pooled(points, smooth);
    const weight = (observed + pseudoCount) / (expected + pseudoCount);
    weights.push({ points, weight });
    if (points !== 0) weights.unshift({ points: -points, weight });
  }
  return weights;
}

export function fitResidualDistribution(
  residuals: readonly number[],
  bandwidth: number,
  padding = 14,
  keyWeights: KeyWeight[] = [],
): ResidualDistribution {
  if (residuals.length === 0) throw new Error("Residual distribution needs training residuals");
  if (bandwidth <= 0) throw new Error("Residual bandwidth must be positive");
  const low = Math.min(...residuals);
  const high = Math.max(...residuals);
  const min = Math.floor(Math.min(low - padding, -MIN_SUPPORT));
  const max = Math.ceil(Math.max(high + padding, MIN_SUPPORT));
  return { residuals: [...residuals], bandwidth, support: { min, max }, keyWeights };
}

function kernel(distance: number, bandwidth: number): number {
  const z = distance / bandwidth;
  return Math.exp(-0.5 * z * z);
}

export function integerMass(distribution: ResidualDistribution, mean: number): MassBin[] {
  const bins: MassBin[] = [];
  const keyWeight = new Map(distribution.keyWeights.map((entry) => [entry.points, entry.weight]));
  let total = 0;
  for (let points = distribution.support.min; points <= distribution.support.max; points += 1) {
    let weight = 0;
    for (const residual of distribution.residuals) {
      weight += kernel(points - (mean + residual), distribution.bandwidth);
    }
    weight *= keyWeight.get(points) ?? 1;
    bins.push({ points, probability: weight });
    total += weight;
  }
  if (total <= 0) throw new Error("Residual kernel produced no mass");
  return bins.map((bin) => ({ points: bin.points, probability: bin.probability / total }));
}

export type SideProbability = {
  win: number;
  loss: number;
  push: number;
};

export function moneylineFromMargin(bins: readonly MassBin[]): {
  home: SideProbability;
  away: SideProbability;
} {
  let homeWin = 0;
  let awayWin = 0;
  let tie = 0;
  for (const bin of bins) {
    if (bin.points > 0) homeWin += bin.probability;
    else if (bin.points < 0) awayWin += bin.probability;
    else tie += bin.probability;
  }
  return {
    home: { win: homeWin, loss: awayWin, push: tie },
    away: { win: awayWin, loss: homeWin, push: tie },
  };
}

export function spreadFromMargin(
  bins: readonly MassBin[],
  homeLine: number,
): { home: SideProbability; away: SideProbability } {
  let homeWin = 0;
  let awayWin = 0;
  let push = 0;
  for (const bin of bins) {
    const covered = bin.points + homeLine;
    if (covered > 0) homeWin += bin.probability;
    else if (covered < 0) awayWin += bin.probability;
    else push += bin.probability;
  }
  return {
    home: { win: homeWin, loss: awayWin, push },
    away: { win: awayWin, loss: homeWin, push },
  };
}

export function totalFromDistribution(
  bins: readonly MassBin[],
  line: number,
): { over: SideProbability; under: SideProbability } {
  let over = 0;
  let under = 0;
  let push = 0;
  for (const bin of bins) {
    if (bin.points > line) over += bin.probability;
    else if (bin.points < line) under += bin.probability;
    else push += bin.probability;
  }
  return {
    over: { win: over, loss: under, push },
    under: { win: under, loss: over, push },
  };
}
