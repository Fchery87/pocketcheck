import { describe, expect, it } from "vite-plus/test";
import { fitResidualDistribution, smoothMass } from "../../src/lib/server/models/distribution.ts";

function residuals(count: number): number[] {
  let seed = 3;
  return Array.from({ length: count }, () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (seed / 2147483648 - 0.5) * 50;
  });
}

/** The kernel sum the model used before the grid, normalized over the support. */
function exact(values: number[], bandwidth: number, min: number, max: number, mean: number) {
  const raw: number[] = [];
  for (let points = min; points <= max; points += 1) {
    let weight = 0;
    for (const residual of values) {
      const z = (points - mean - residual) / bandwidth;
      weight += Math.exp(-0.5 * z * z);
    }
    raw.push(weight);
  }
  const total = raw.reduce((sum, value) => sum + value, 0);
  return raw.map((value) => value / total);
}

describe("smooth integer mass", () => {
  const values = residuals(400);
  const distribution = fitResidualDistribution(values, 1.5);

  it("matches the exact kernel sum at fractional means", () => {
    for (const mean of [-6.37, 0, 2.5, 3.01, 11.9]) {
      const first = smoothMass(distribution, mean)[0]!.points;
      const last = smoothMass(distribution, mean).at(-1)!.points;
      const expected = exact(values, 1.5, first, last, mean);
      const actual = smoothMass(distribution, mean).map((bin) => bin.probability);
      expect(actual).toHaveLength(expected.length);
      actual.forEach((probability, index) => {
        expect(Math.abs(probability - (expected[index] ?? 0))).toBeLessThan(1e-5);
      });
    }
  });

  it("centers its integer outcomes on the predicted mean, so high totals keep their mass", () => {
    const totals = fitResidualDistribution([-12, -4, 0, 5, 13], 1.5);
    const bins = smoothMass(totals, 47.5);
    expect(bins.reduce((sum, bin) => sum + bin.probability, 0)).toBeCloseTo(1, 10);
    expect(bins.at(-1)!.points).toBeGreaterThanOrEqual(47.5 + 13 + 14);
    const above = bins
      .filter((bin) => bin.points > 55)
      .reduce((sum, bin) => sum + bin.probability, 0);
    expect(above).toBeGreaterThan(0.15);
  });

  it("scores thousands of games quickly with thousands of residuals", () => {
    const large = fitResidualDistribution(residuals(5000), 1.5);
    const started = performance.now();
    for (let game = 0; game < 2000; game += 1) smoothMass(large, (game % 30) - 15 + 0.3);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
