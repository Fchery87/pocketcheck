import { describe, expect, it } from "vite-plus/test";
import { anchorFromQuote, marginFromHomeLine } from "../../src/lib/server/models/anchor.ts";
import {
  fitResidualDistribution,
  integerMass,
  spreadFromMargin,
} from "../../src/lib/server/models/distribution.ts";

const residuals = fitResidualDistribution(
  Array.from({ length: 200 }, (_, index) => (index % 41) - 20),
  2,
);

describe("spread anchor", () => {
  it("expects a home favorite to win by its line", () => {
    const anchor = anchorFromQuote(
      "spread",
      { sportsbook: "book", homeAmerican: -110, awayAmerican: -110, line: -7 },
      residuals,
    );
    expect(anchor.mean).toBe(7);
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
