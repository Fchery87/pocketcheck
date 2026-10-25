import { describe, expect, it } from "vite-plus/test";
import { decimalPriceCutoff, sensitivity } from "#lib/domain/sensitivity.ts";

describe("experimental sensitivity", () => {
  it("shows expected value before and after a stated shift without calling it proof", () => {
    const result = sensitivity({
      decimalOdds: 1.909090909,
      probabilities: { win: 0.55, loss: 0.45, push: 0 },
      winProbabilityShift: -0.03,
    });
    expect(result.experimental).toBe(true);
    expect(result.label.toLowerCase()).toContain("not proof of an edge");
    expect(result.before).toBeCloseTo(0.55 * 0.909090909 - 0.45, 6);
    expect(result.after).toBeCloseTo(0.52 * 0.909090909 - 0.48, 6);
    expect(result.after).not.toBe(result.before);
  });

  it("leaves the shifted estimate unavailable when probabilities are missing", () => {
    const result = sensitivity({
      decimalOdds: 2,
      probabilities: null,
      winProbabilityShift: 0.01,
    });
    expect(result.before).toBeNull();
    expect(result.after).toBeNull();
  });

  it("computes the decimal minimum and withholds it when probabilities are missing", () => {
    const cutoff = decimalPriceCutoff({
      probabilities: { win: 0.5, loss: 0.5, push: 0 },
      targetExpectedValue: 0.02,
    });
    expect(cutoff.available).toBe(true);
    if (cutoff.available) expect(cutoff.decimalMinimum).toBeCloseTo(1 + (0.5 + 0.02) / 0.5, 8);
    expect(
      decimalPriceCutoff({ probabilities: null, targetExpectedValue: 0 }).available,
    ).toBe(false);
  });
});
