export type MassBin = {
  points: number;
  probability: number;
};

export type ResidualDistribution = {
  residuals: number[];
  bandwidth: number;
  support: { min: number; max: number };
};

const MIN_SUPPORT = 21;

export function fitResidualDistribution(
  residuals: readonly number[],
  bandwidth: number,
  padding = 14,
): ResidualDistribution {
  if (residuals.length === 0) throw new Error("Residual distribution needs training residuals");
  if (bandwidth <= 0) throw new Error("Residual bandwidth must be positive");
  const low = Math.min(...residuals);
  const high = Math.max(...residuals);
  const min = Math.floor(Math.min(low - padding, -MIN_SUPPORT));
  const max = Math.ceil(Math.max(high + padding, MIN_SUPPORT));
  return { residuals: [...residuals], bandwidth, support: { min, max } };
}

function kernel(distance: number, bandwidth: number): number {
  const z = distance / bandwidth;
  return Math.exp(-0.5 * z * z);
}

export function integerMass(distribution: ResidualDistribution, mean: number): MassBin[] {
  const bins: MassBin[] = [];
  let total = 0;
  for (let points = distribution.support.min; points <= distribution.support.max; points += 1) {
    let weight = 0;
    for (const residual of distribution.residuals) {
      weight += kernel(points - (mean + residual), distribution.bandwidth);
    }
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
