import { describe, expect, it } from "vite-plus/test";
import {
  conservativeProbabilities,
  fitUncertainty,
  slateOf,
  UNCERTAINTY_OPTIONS,
  type CalibrationSample,
} from "../../src/lib/server/models/uncertainty.ts";

function samples(
  count: number,
  slateSize: number,
  winsFor: (index: number) => boolean,
  decisiveWin = 0.62,
): CalibrationSample[] {
  return Array.from({ length: count }, (_, index) => ({
    market: "moneyline" as const,
    slate: `s${Math.floor(index / slateSize)}`,
    decisiveWin,
    outcome: winsFor(index) ? ("win" as const) : ("loss" as const),
  }));
}

describe("slates", () => {
  it("groups Thursday to Monday night, in Eastern time, into one week", () => {
    const thursday = slateOf("2026-10-23T00:15:00.000Z"); // Thu Oct 22, 8:15 pm ET
    expect(thursday).toBe("2026-10-20");
    expect(slateOf("2026-10-26T17:00:00.000Z")).toBe(thursday); // Sun Oct 25, 1 pm ET
    expect(slateOf("2026-10-27T00:15:00.000Z")).toBe(thursday); // Mon Oct 26, 8:15 pm ET
    expect(slateOf("2026-10-29T00:15:00.000Z")).not.toBe(thursday); // next Thu
  });
});

describe("calibration table", () => {
  it("bins decisive forecasts and keeps the conservative rate at or below the observed rate", () => {
    const table = fitUncertainty(samples(400, 4, (index) => index % 5 < 3));
    const bin = table.markets.moneyline.find((entry) => entry.lower === 0.6)!;
    expect(bin.sides).toBe(400);
    expect(bin.slates).toBe(100);
    expect(bin.observedRate).toBeCloseTo(0.6, 10);
    expect(bin.meanPredicted).toBeCloseTo(0.62, 10);
    expect(bin.conservativeRate!).toBeLessThan(bin.observedRate!);
    expect(table.options).toEqual(UNCERTAINTY_OPTIONS);
  });

  it("treats a slate's results as one unit, so correlated slates widen the interval", () => {
    // Same 400 sides and the same 50% rate; only the slate grouping differs.
    const independent = fitUncertainty(samples(400, 1, (index) => index % 2 === 0));
    const correlated = fitUncertainty(samples(400, 10, (index) => Math.floor(index / 10) % 2 === 0));
    const rate = (table: ReturnType<typeof fitUncertainty>) =>
      table.markets.moneyline.find((entry) => entry.lower === 0.6)!.conservativeRate!;
    expect(rate(correlated)).toBeLessThan(rate(independent) - 0.03);
  });

  it("ignores pushes, which have no decisive result", () => {
    const pushes = samples(100, 1, () => true).map((sample) => ({ ...sample, outcome: "push" as const }));
    expect(fitUncertainty(pushes).markets.moneyline.every((bin) => bin.sides === 0)).toBe(true);
  });

  it("is reproducible from its stored seed", () => {
    const input = samples(300, 3, (index) => index % 3 !== 0);
    expect(fitUncertainty(input)).toEqual(fitUncertainty(input));
  });
});

describe("conservative probabilities", () => {
  const table = fitUncertainty(samples(400, 4, (index) => index % 5 < 3));

  it("lowers the decisive win probability by the bin's calibration bound and keeps the push", () => {
    const result = conservativeProbabilities(table, "moneyline", { win: 0.6, loss: 0.37, push: 0.03 });
    if (!result.available) throw new Error(result.reason);
    const bin = table.markets.moneyline.find((entry) => entry.lower === 0.6)!;
    const q = 0.6 / 0.97;
    const expected = Math.min(q, bin.conservativeRate! + (q - bin.meanPredicted!));
    expect(result.probabilities.win).toBeCloseTo(expected * 0.97, 12);
    expect(result.probabilities.push).toBe(0.03);
    const { win, loss, push } = result.probabilities;
    expect(win + loss + push).toBeCloseTo(1, 12);
    expect(result.probabilities.win).toBeLessThanOrEqual(0.6);
    expect(result.confidence).toBe(UNCERTAINTY_OPTIONS.confidence);
  });

  it("is unavailable where training produced too few forecasts", () => {
    const result = conservativeProbabilities(table, "moneyline", { win: 0.2, loss: 0.8, push: 0 });
    expect(result).toMatchObject({ available: false });
    expect(!result.available && result.reason).toMatch(/fewer than 60/);
  });
});
