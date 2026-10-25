import {
  integerMass,
  moneylineFromMargin,
  spreadFromMargin,
  totalFromDistribution,
  type MassBin,
  type SideProbability,
} from "./distribution.ts";
import type { FeatureRow } from "./features.ts";
import { predictMean, type LinearModel } from "./fit.ts";
import type { ModelArtifact } from "./artifact.ts";

export type GameProbabilities = {
  gameId: string;
  marginMean: number;
  totalMean: number;
  marginBins: MassBin[];
  totalBins: MassBin[];
  moneyline: { home: SideProbability; away: SideProbability };
  spread: (homeLine: number) => { home: SideProbability; away: SideProbability };
  total: (line: number) => { over: SideProbability; under: SideProbability };
};

function side(
  model: LinearModel,
  residuals: ModelArtifact["margin"]["residuals"],
  row: FeatureRow,
): {
  mean: number;
  bins: MassBin[];
} {
  const mean = predictMean(model, row);
  return { mean, bins: integerMass(residuals, mean) };
}

export function predictGame(artifact: ModelArtifact, row: FeatureRow): GameProbabilities {
  const margin = side(artifact.margin.model, artifact.margin.residuals, row);
  const total = side(artifact.total.model, artifact.total.residuals, row);
  const moneyline = moneylineFromMargin(margin.bins);
  return {
    gameId: row.gameId,
    marginMean: margin.mean,
    totalMean: total.mean,
    marginBins: margin.bins,
    totalBins: total.bins,
    moneyline,
    spread: (homeLine) => spreadFromMargin(margin.bins, homeLine),
    total: (line) => totalFromDistribution(total.bins, line),
  };
}
