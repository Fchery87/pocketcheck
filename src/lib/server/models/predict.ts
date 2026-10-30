import {
  anchoredMass,
  moneylineFromMargin,
  spreadFromMargin,
  totalFromDistribution,
  type MassBin,
  type SideProbability,
} from "./distribution.ts";
import type { FeatureRow } from "./features.ts";
import { meanContributions, predictMean, type MeanContributions } from "./fit.ts";
import type { ModelArtifact } from "./artifact.ts";

export type GameProbabilities = {
  gameId: string;
  marginMean: number;
  totalMean: number;
  marginBins: MassBin[];
  totalBins: MassBin[];
  moneyline: { home: SideProbability; away: SideProbability };
  spread: (homeLine: number) => {
    home: SideProbability;
    away: SideProbability;
  };
  total: (line: number) => { over: SideProbability; under: SideProbability };
  /** What moved each predicted mean: margin for moneyline and spread, total for totals. */
  drivers: { margin: MeanContributions; total: MeanContributions };
};

export function predictGame(
  artifact: ModelArtifact,
  row: FeatureRow,
  anchor?: {
    marginMean?: number;
    totalMean?: number;
    marginAnchor?: { mean: number; adjustment: number };
    totalAnchor?: { mean: number; adjustment: number };
  },
): GameProbabilities {
  const marginMean = anchor?.marginAnchor
    ? anchor.marginAnchor.mean + anchor.marginAnchor.adjustment
    : (anchor?.marginMean ?? predictMean(artifact.margin.model, row));
  const totalMean = anchor?.totalAnchor
    ? anchor.totalAnchor.mean + anchor.totalAnchor.adjustment
    : (anchor?.totalMean ?? predictMean(artifact.total.model, row));
  const marginBins = anchor?.marginAnchor
    ? anchoredMass(
        artifact.margin.residuals,
        anchor.marginAnchor.mean,
        anchor.marginAnchor.adjustment,
      )
    : anchoredMass(artifact.margin.residuals, marginMean, 0);
  const totalBins = anchor?.totalAnchor
    ? anchoredMass(artifact.total.residuals, anchor.totalAnchor.mean, anchor.totalAnchor.adjustment)
    : anchoredMass(artifact.total.residuals, totalMean, 0);
  const moneyline = moneylineFromMargin(marginBins);
  return {
    gameId: row.gameId,
    marginMean,
    totalMean,
    marginBins,
    totalBins,
    moneyline,
    spread: (homeLine) => spreadFromMargin(marginBins, homeLine),
    total: (line) => totalFromDistribution(totalBins, line),
    drivers: {
      margin: meanContributions(artifact.margin.model, row),
      total: meanContributions(artifact.total.model, row),
    },
  };
}

/**
 * The same forecast with one input group's features replaced by their training means, so that
 * group's adjustment is zero. Used to measure what the group contributes.
 */
export function predictWithoutGroup(
  artifact: ModelArtifact,
  row: FeatureRow,
  features: readonly string[],
  anchor?: { marginMean?: number; totalMean?: number },
): GameProbabilities {
  const neutralized = { ...row, features: { ...row.features } };
  for (const feature of features) {
    if (feature in artifact.margin.model.featureMeans) {
      const name = feature as keyof typeof row.features;
      neutralized.features[name] = artifact.margin.model.featureMeans[name];
    }
  }
  return predictGame(artifact, neutralized, anchor);
}
