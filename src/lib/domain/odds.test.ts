import { describe, expect, it } from "vite-plus/test";
import {
  americanToDecimal,
  breakEven,
  decimalToAmerican,
  expectedValue,
  proportionalMargin,
  unitReturn,
} from "#lib/domain/odds.ts";

describe("American price conversion", () => {
  it("converts a positive American price to decimal odds including stake", () => {
    expect(americanToDecimal(130)).toBeCloseTo(2.3, 10);
  });

  it("converts a negative American price to decimal odds including stake", () => {
    expect(americanToDecimal(-150)).toBeCloseTo(1 + 100 / 150, 10);
  });

  it("round-trips −110 within one cent of American price", () => {
    expect(decimalToAmerican(americanToDecimal(-110))).toBeCloseTo(-110, 0);
  });

  it("rejects a zero, positive-under-100, or nonfinite American price", () => {
    expect(() => americanToDecimal(0)).toThrow(/American price/);
    expect(() => americanToDecimal(99)).toThrow(/American price/);
    expect(() => americanToDecimal(Number.NaN)).toThrow(/American price/);
  });
});

describe("break-even and illustrative expected value", () => {
  it("reports the handbook −110 decisive break-even and no-push value", () => {
    const price = americanToDecimal(-110);
    expect(price).toBeCloseTo(1.9090909, 6);
    expect(breakEven(price).decisive).toBeCloseTo(0.5238095, 6);
    expect(
      expectedValue({
        decimalOdds: price,
        probabilities: { win: 0.55, loss: 0.45, push: 0 },
        illustrative: true,
      }),
    ).toEqual({
      perUnit: expect.closeTo(0.05, 6),
      illustrative: true,
    });
  });

  it("uses the three-outcome payoff and does not treat decisive break-even as unconditional", () => {
    const price = americanToDecimal(-110);
    const value = expectedValue({
      decimalOdds: price,
      probabilities: { win: 0.52, loss: 0.45, push: 0.03 },
      illustrative: true,
    });
    expect(value.perUnit).toBeCloseTo(0.022727, 5);
    expect(breakEven(price).unconditionalWinsAt(0.03)).toBeCloseTo((1 - 0.03) / price, 6);
    expect(breakEven(price).unconditionalWinsAt(0.03)).not.toBeCloseTo(
      breakEven(price).decisive,
      3,
    );
  });

  it("leaves expected value unavailable when no probability method is supplied", () => {
    expect(
      expectedValue({
        decimalOdds: americanToDecimal(-110),
        probabilities: null,
        illustrative: false,
      }),
    ).toEqual({ perUnit: null, illustrative: false });
  });
});

describe("proportional market margin", () => {
  it("removes margin from comparable −150 and +130 prices", () => {
    const estimate = proportionalMargin([
      { side: "favorite", american: -150 },
      { side: "underdog", american: 130 },
    ]);
    expect(estimate).toEqual({
      available: true,
      assumption: "proportional",
      overround: expect.closeTo(0.0347826, 6),
      probabilities: {
        favorite: expect.closeTo(0.5798319, 6),
        underdog: expect.closeTo(0.4201681, 6),
      },
    });
  });

  it("omits the estimate when only one side is priced", () => {
    expect(proportionalMargin([{ side: "favorite", american: -150 }])).toEqual({
      available: false,
      reason: "missing-complement",
    });
  });
});

describe("unit return", () => {
  it("pays stake times net decimal on a win and returns zero on a push or void", () => {
    const decimal = americanToDecimal(-110);
    expect(unitReturn({ result: "win", stake: 2, decimalOdds: decimal })).toBeCloseTo(
      2 * (decimal - 1),
      8,
    );
    expect(unitReturn({ result: "loss", stake: 2, decimalOdds: decimal })).toBe(-2);
    expect(unitReturn({ result: "push", stake: 2, decimalOdds: decimal })).toBe(0);
    expect(unitReturn({ result: "void", stake: 2, decimalOdds: decimal })).toBe(0);
  });
});
