import { describe, expect, it } from "vite-plus/test";
import { compareClosing } from "./closing.ts";

const open = {
  market: "spread",
  selection: "home",
  pointLine: -3.5,
  sportsbook: "book",
  decimalOdds: 1.91,
};

describe("closing comparison", () => {
  it("compares the same contract", () => {
    const result = compareClosing(open, { ...open, decimalOdds: 1.87 });
    expect(result).toEqual({
      available: true,
      openDecimal: 1.91,
      closeDecimal: 1.87,
      difference: expect.closeTo(-0.04, 8),
    });
  });

  it("treats a different point line as unavailable, not zero", () => {
    const result = compareClosing(open, { ...open, pointLine: -3, decimalOdds: 1.91 });
    expect(result).toEqual({ available: false, reason: "different-contract" });
    expect(result).not.toEqual(expect.objectContaining({ difference: 0 }));
  });

  it("treats a missing closing price as unavailable", () => {
    expect(compareClosing(open, { ...open, decimalOdds: null })).toEqual({
      available: false,
      reason: "missing-closing-price",
    });
  });

  it("requires the same market, side, and sportsbook", () => {
    expect(compareClosing(open, { ...open, sportsbook: "other" }).available).toBe(false);
    expect(compareClosing(open, { ...open, selection: "away" }).available).toBe(false);
    expect(compareClosing(open, { ...open, market: "total" }).available).toBe(false);
  });
});
