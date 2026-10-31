import { describe, expect, it } from "vite-plus/test";
import { marketComparison } from "#lib/domain/comparison.ts";

describe("model beside market", () => {
  it("compares a moneyline win chance with the no-vig price in percentage points", () => {
    const compared = marketComparison({
      probabilities: { win: 0.62, loss: 0.38, push: 0 },
      noVigProbability: 0.6,
    });
    expect(compared.model).toBe(0.62);
    expect(compared.market).toBeCloseTo(0.6, 10);
    expect(compared.gapPoints).toBeCloseTo(2, 10);
  });

  it("leaves room for the model's push chance in the market figure", () => {
    const compared = marketComparison({
      probabilities: { win: 0.5, loss: 0.45, push: 0.05 },
      noVigProbability: 0.5,
    });
    expect(compared.market).toBeCloseTo(0.475, 10);
    expect(compared.gapPoints).toBeCloseTo(2.5, 10);
  });

  it("reports a negative gap when the market rates the side higher", () => {
    const compared = marketComparison({
      probabilities: { win: 0.4, loss: 0.6, push: 0 },
      noVigProbability: 0.42,
    });
    expect(compared.gapPoints).toBeCloseTo(-2, 10);
  });
});
