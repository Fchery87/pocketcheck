import { describe, expect, it } from "vite-plus/test";
import { VALUE_THRESHOLD } from "../../src/lib/domain/threshold.ts";
import { scoreHoldout, summarize } from "../../src/lib/server/models/evaluate.ts";
import { buildFeatureRows } from "../../src/lib/server/models/features.ts";
import type { PricedGame } from "../../src/lib/server/models/games.ts";
import { fitArtifact } from "../../src/lib/server/models/train.ts";
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
    const correlated = fitUncertainty(
      samples(400, 10, (index) => Math.floor(index / 10) % 2 === 0),
    );
    const rate = (table: ReturnType<typeof fitUncertainty>) =>
      table.markets.moneyline.find((entry) => entry.lower === 0.6)!.conservativeRate!;
    expect(rate(correlated)).toBeLessThan(rate(independent) - 0.03);
  });

  it("ignores pushes, which have no decisive result", () => {
    const pushes = samples(100, 1, () => true).map((sample) => ({
      ...sample,
      outcome: "push" as const,
    }));
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
    const result = conservativeProbabilities(table, "moneyline", {
      win: 0.6,
      loss: 0.37,
      push: 0.03,
    });
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

/** A league with real team strength, a priced spread on every game, and three games a slate. */
function pricedLeague(count: number): PricedGame[] {
  let seed = 5;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const strength = Array.from({ length: 12 }, (_, team) => team - 5.5);
  return Array.from({ length: count }, (_, index) => {
    const home = index % 12;
    const away = (home + 1 + (index % 11)) % 12;
    const margin = Math.round(2 + strength[home]! - strength[away]! + (next() - 0.5) * 28);
    const awayScore = 10 + Math.floor(next() * 14);
    return {
      id: `p${String(index).padStart(4, "0")}`,
      kickoff: new Date(
        Date.UTC(2015, 8, 10) + Math.floor(index / 3) * 7 * 86_400_000,
      ).toISOString(),
      home: `T${home}`,
      away: `T${away}`,
      homeScore: Math.max(0, awayScore + margin),
      awayScore,
      prices: {
        moneyline: { home: { american: -150 }, away: { american: 130 } },
        spread: { line: -3, home: { american: -110 }, away: { american: -110 } },
        total: { line: 44.5, over: { american: -110 }, under: { american: -110 } },
      },
    };
  });
}

describe("artifact uncertainty", { timeout: 60_000 }, () => {
  const games = pricedLeague(1500);
  const cutoff = games[1199]!.kickoff;

  it("records a walk-forward calibration table for every market", () => {
    const artifact = fitArtifact(games, cutoff);
    expect(artifact.version).toBe(6);
    expect(artifact.uncertainty.method).toBe("walk-forward-calibration");
    for (const market of ["moneyline", "spread", "total"] as const) {
      const populated = artifact.uncertainty.markets[market].filter((bin) => bin.sides > 0);
      expect(populated.length, market).toBeGreaterThan(0);
      for (const bin of populated.filter((entry) => entry.conservativeRate !== null)) {
        expect(bin.conservativeRate!).toBeLessThanOrEqual(bin.observedRate! + 1e-12);
      }
    }
  });

  it("never looks at results after the training cutoff", () => {
    const flipped = games.map((game, index) =>
      index > 1199 ? { ...game, homeScore: game.awayScore, awayScore: game.homeScore } : game,
    );
    expect(fitArtifact(flipped, cutoff).uncertainty).toEqual(
      fitArtifact(games, cutoff).uncertainty,
    );
  });

  it("is reproducible", () => {
    expect(fitArtifact(games, cutoff).uncertainty).toEqual(fitArtifact(games, cutoff).uncertainty);
  });

  it("has no calibration when the window is too small for walk-forward forecasts", () => {
    const tiny = fitArtifact(games.slice(0, 20), games[19]!.kickoff);
    expect(tiny.uncertainty.markets.moneyline.every((bin) => bin.sides === 0)).toBe(true);
  });
});

describe("threshold evaluation", () => {
  const games = pricedLeague(1500);
  const artifact = fitArtifact(games, games[1199]!.kickoff);
  const holdout = buildFeatureRows(games, artifact.featureParameters).filter(
    (row) => row.kickoff > artifact.trainingCutoff,
  );
  const summary = summarize(scoreHoldout(artifact, holdout, games));

  it("reports how the frozen threshold would have behaved, without choosing it", () => {
    expect(summary.threshold.version).toBe(VALUE_THRESHOLD.version);
    expect(summary.threshold.conservativeExpectedValue).toBe(
      VALUE_THRESHOLD.conservativeExpectedValue,
    );
    expect(summary.threshold.note).toMatch(/closing prices/i);
    for (const market of ["moneyline", "spread", "total"] as const) {
      const report = summary.threshold.markets[market];
      expect(report.candidates).toBeLessThanOrEqual(report.assessed);
      expect(report.wins).toBeLessThanOrEqual(report.decisive);
    }
  });

  it("gives each baseline comparison a slate-clustered interval for the log-loss difference", () => {
    for (const comparison of summary.baselines) {
      const difference = comparison.model.logLoss - comparison.baseline.logLoss;
      const interval = comparison.logLossDifferenceInterval;
      expect(interval, `${comparison.market} ${comparison.name}`).not.toBeNull();
      expect(interval![0]).toBeLessThanOrEqual(difference + 1e-9);
      expect(interval![1]).toBeGreaterThanOrEqual(difference - 1e-9);
    }
  });
});
