import { describe, expect, it } from "vite-plus/test";
import { anchorFromQuote, marginFromHomeLine } from "../../src/lib/server/models/anchor.ts";
import {
  fitResidualDistribution,
  integerMass,
  spreadFromMargin,
  totalFromDistribution,
  meanForDecisiveProbability,
} from "../../src/lib/server/models/distribution.ts";

const residuals = fitResidualDistribution(
  Array.from({ length: 200 }, (_, index) => (index % 41) - 20),
  2,
);

describe("spread anchor", () => {
  it("returns unavailable rather than clamping an infeasible target", () => {
    expect(() =>
      meanForDecisiveProbability(residuals, 0.5, 0, () => ({ win: 0.2, loss: 0.8, push: 0 })),
    ).toThrow(/unavailable.*bracket/);
    expect(() =>
      meanForDecisiveProbability(residuals, NaN, 0, () => ({ win: 1, loss: 0, push: 0 })),
    ).toThrow(/unavailable/);
  });
  it("preserves ordered decisive probabilities with positive key weights", () => {
    const weighted = fitResidualDistribution([-12, -7, -3, 0, 3, 7, 12], 3, 14, [
      { points: 3, weight: 5 },
      { points: 7, weight: 4 },
      { points: 0, weight: 0.1 },
    ]);
    let previous = 0;
    for (let mean = -15; mean <= 15; mean += 0.25) {
      const side = spreadFromMargin(integerMass(weighted, mean), -3).home;
      const probability = side.win / (side.win + side.loss);
      expect(probability).toBeGreaterThanOrEqual(previous - 1e-8);
      previous = probability;
    }
  });
  it.each(["spread", "total"] as const)(
    "matches shaded %s decisive probability at integer and half lines",
    (market) => {
      const asymmetric = fitResidualDistribution([-12, -8, -8, -7, -3, 0, 1, 2, 15], 2, 14, [
        { points: 3, weight: 4 },
        { points: 7, weight: 3 },
      ]);
      for (const line of market === "spread" ? [-7, -3.5, 3, 7.5] : [44, 44.5]) {
        const anchor = anchorFromQuote(
          market,
          { sportsbook: "book", homeAmerican: -125, awayAmerican: 105, line },
          asymmetric,
        );
        const bins = integerMass(asymmetric, anchor.mean);
        const side =
          market === "spread"
            ? spreadFromMargin(bins, line).home
            : totalFromDistribution(bins, line).over;
        const expected = 125 / 225 / (125 / 225 + 100 / 205);
        expect(side.win / (side.win + side.loss)).toBeCloseTo(expected, 7);
      }
    },
  );
  it("matches an even quote without assuming the line is the mean", () => {
    const anchor = anchorFromQuote(
      "spread",
      { sportsbook: "book", homeAmerican: -110, awayAmerican: -110, line: -7 },
      residuals,
    );
    const side = spreadFromMargin(integerMass(residuals, anchor.mean), -7).home;
    expect(side.win / (side.win + side.loss)).toBeCloseTo(0.5, 7);
    expect(marginFromHomeLine(3.5)).toBe(-3.5);
    expect(Object.is(marginFromHomeLine(0), 0)).toBe(true);
  });

  it("prices a home favorite near even at its own line", () => {
    const anchor = anchorFromQuote(
      "spread",
      { sportsbook: "book", homeAmerican: -110, awayAmerican: -110, line: -7 },
      residuals,
    );
    const cover = spreadFromMargin(integerMass(residuals, anchor.mean), -7);
    expect(cover.home.win).toBeGreaterThan(0.4);
    expect(cover.home.win).toBeLessThan(0.6);
  });
});
