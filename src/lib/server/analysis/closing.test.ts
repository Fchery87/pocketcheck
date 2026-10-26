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
    expect(result).toEqual({
      available: false,
      reason: "different-contract",
      lineMovement: { openPointLine: -3.5, closePointLine: -3 },
    });
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

  it("compares when the rules are compatible", () => {
    const result = compareClosing(
      { ...open, rules: { period: "full-game", overtime: "included", tie: null } },
      {
        ...open,
        decimalOdds: 1.87,
        rules: { period: "full-game", overtime: "included", tie: null },
      },
    );
    expect(result).toMatchObject({ available: true, difference: expect.closeTo(-0.04, 8) });
  });

  it("refuses a direct comparison when the tie rule differs", () => {
    const result = compareClosing(
      { ...open, rules: { period: "full-game", overtime: "included", tie: "push" } },
      {
        ...open,
        decimalOdds: 1.87,
        rules: { period: "full-game", overtime: "included", tie: "loss" },
      },
    );
    expect(result).toEqual({ available: false, reason: "incompatible-rules" });
  });

  it("reports a different point line as line movement, not a comparable odds change", () => {
    const result = compareClosing(open, { ...open, pointLine: -3, decimalOdds: 2.1 });
    expect(result).toEqual({
      available: false,
      reason: "different-contract",
      lineMovement: { openPointLine: -3.5, closePointLine: -3 },
    });
    expect(result).not.toEqual(expect.objectContaining({ difference: expect.any(Number) }));
  });
});
