import { FEATURE_DEFINITIONS, type FeatureName, type FeatureRow } from "./features.ts";
import { kickoffMs, resultAvailableMs } from "./games.ts";

export type FitParameters = {
  ridge: number;
  residualBandwidth: number;
  /** Chronological blocks for walk-forward residuals. */
  residualFolds: number;
};

export const DEFAULT_FIT: FitParameters = {
  ridge: 1,
  residualBandwidth: 1.5,
  residualFolds: 5,
};

export type LinearModel = {
  intercept: number;
  coefficients: Record<FeatureName, number>;
  featureMeans: Record<FeatureName, number>;
  featureScales: Record<FeatureName, number>;
};

const NAMES = FEATURE_DEFINITIONS.map((feature) => feature.name);

/** One feature's signed effect, in points, on a predicted mean. */
export type FeatureContribution = {
  feature: FeatureName;
  /** The feature's value for this game. */
  value: number;
  /** Coefficient times the scaled deviation from the training mean. */
  points: number;
};

export type MeanContributions = {
  intercept: number;
  /** In feature definition order. The intercept plus every effect is the predicted mean. */
  contributions: FeatureContribution[];
};

export function meanContributions(model: LinearModel, row: FeatureRow): MeanContributions {
  return {
    intercept: model.intercept,
    contributions: NAMES.map((name) => ({
      feature: name,
      value: row.features[name],
      points:
        (model.coefficients[name] * (row.features[name] - model.featureMeans[name])) /
        model.featureScales[name],
    })),
  };
}

export function predictMean(model: LinearModel, row: FeatureRow): number {
  const { intercept, contributions } = meanContributions(model, row);
  return contributions.reduce((value, item) => value + item.points, intercept);
}

function solve(matrix: number[][], vector: number[]): number[] {
  const n = vector.length;
  const a = matrix.map((row, index) => [...row, vector[index] ?? 0]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row]?.[col] ?? 0) > Math.abs(a[pivot]?.[col] ?? 0)) pivot = row;
    }
    const pivotRow = a[pivot];
    const colRow = a[col];
    if (!pivotRow || !colRow || Math.abs(pivotRow[col] ?? 0) < 1e-12) {
      throw new Error("Ridge design matrix is singular");
    }
    a[pivot] = colRow;
    a[col] = pivotRow;
    const scale = pivotRow[col] ?? 1;
    for (let k = col; k <= n; k += 1) pivotRow[k] = (pivotRow[k] ?? 0) / scale;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row]?.[col] ?? 0;
      for (let k = col; k <= n; k += 1) {
        const current = a[row];
        if (current) current[k] = (current[k] ?? 0) - factor * (pivotRow[k] ?? 0);
      }
    }
  }
  return a.map((row) => row[n] ?? 0);
}

export function fitRidge(
  rows: readonly FeatureRow[],
  targets: readonly number[],
  ridge: number,
): LinearModel {
  if (rows.length === 0 || rows.length !== targets.length) {
    throw new Error("Feature rows and targets must be non-empty and aligned");
  }
  const means = {} as Record<FeatureName, number>;
  const scales = {} as Record<FeatureName, number>;
  for (const name of NAMES) {
    const values = rows.map((row) => row.features[name]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    means[name] = mean;
    scales[name] = Math.sqrt(variance) || 1;
  }

  const width = NAMES.length + 1;
  const matrix = Array.from({ length: width }, () => Array.from({ length: width }, () => 0));
  const vector = Array.from({ length: width }, () => 0);
  rows.forEach((row, index) => {
    const x = [1, ...NAMES.map((name) => (row.features[name] - means[name]) / scales[name])];
    const y = targets[index] ?? 0;
    for (let i = 0; i < width; i += 1) {
      vector[i] = (vector[i] ?? 0) + (x[i] ?? 0) * y;
      for (let j = 0; j < width; j += 1) {
        const rowValues = matrix[i];
        if (rowValues) rowValues[j] = (rowValues[j] ?? 0) + (x[i] ?? 0) * (x[j] ?? 0);
      }
    }
  });
  for (let i = 1; i < width; i += 1) {
    const rowValues = matrix[i];
    if (rowValues) rowValues[i] = (rowValues[i] ?? 0) + ridge;
  }
  const solved = solve(matrix, vector);
  const coefficients = {} as Record<FeatureName, number>;
  NAMES.forEach((name, index) => {
    coefficients[name] = solved[index + 1] ?? 0;
  });
  return {
    intercept: solved[0] ?? 0,
    coefficients,
    featureMeans: means,
    featureScales: scales,
  };
}

export type WalkForwardPrediction = {
  /** Row index in the training rows. */
  index: number;
  /** Block number, from 1. Block 0 only trains. */
  block: number;
  mean: number;
  residual: number;
};

/**
 * Out-of-sample predictions. Rows are split into chronological blocks. Each block after the
 * first is predicted by a model fit on earlier outcomes available before its first kickoff.
 * Kickoff groups stay intact. Rows must be in kickoff order.
 */
export function walkForwardPredictions(
  rows: readonly FeatureRow[],
  targets: readonly number[],
  ridge: number,
  folds: number,
): WalkForwardPrediction[] {
  if (folds < 2) throw new Error("Walk-forward residuals need at least two blocks");
  const groups = rows.flatMap((row, index) =>
    index === 0 || kickoffMs(row) !== kickoffMs(rows[index - 1]!) ? [index] : [],
  );
  const blockCount = Math.min(folds, groups.length);
  const starts = Array.from(
    { length: blockCount + 1 },
    (_, index) => groups[Math.floor((index * groups.length) / blockCount)] ?? rows.length,
  );
  const predictions: WalkForwardPrediction[] = [];
  for (let block = 1; block < blockCount; block += 1) {
    const from = starts[block] ?? 0;
    const to = starts[block + 1] ?? rows.length;
    const cutoff = kickoffMs(rows[from]!);
    const eligible = rows
      .slice(0, from)
      .flatMap((row, index) => (resultAvailableMs(row) < cutoff ? [index] : []));
    if (eligible.length === 0) continue;
    const model = fitRidge(
      eligible.map((index) => rows[index]!),
      eligible.map((index) => targets[index]!),
      ridge,
    );
    for (let index = from; index < to; index += 1) {
      const row = rows[index];
      if (!row) continue;
      const mean = predictMean(model, row);
      predictions.push({ index, block, mean, residual: (targets[index] ?? 0) - mean });
    }
  }
  return predictions;
}

/** Residuals that the model did not see when it was fit. See walkForwardPredictions. */
export function walkForwardResiduals(
  rows: readonly FeatureRow[],
  targets: readonly number[],
  ridge: number,
  folds: number,
): number[] {
  return walkForwardPredictions(rows, targets, ridge, folds).map(
    (prediction) => prediction.residual,
  );
}
