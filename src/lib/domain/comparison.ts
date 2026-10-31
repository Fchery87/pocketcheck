import type { OutcomeProbabilities } from "./odds.ts";

/**
 * The forecasting model's win chance beside the market's for one side. The no-vig probability
 * leaves room for the model's push chance, as the evaluation baseline does, so both figures count
 * the same outcomes. The gap is in percentage points, model minus market.
 */
export function marketComparison(input: {
  probabilities: OutcomeProbabilities;
  noVigProbability: number;
}): { model: number; market: number; gapPoints: number } {
  const model = input.probabilities.win;
  const market = input.noVigProbability * (1 - input.probabilities.push);
  return { model, market, gapPoints: (model - market) * 100 };
}
