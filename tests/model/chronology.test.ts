import { describe, expect, it } from "vite-plus/test";
import { scoreHoldout } from "../../src/lib/server/models/evaluate.ts";
import { buildFeatureRows, featureRowForGame } from "../../src/lib/server/models/features.ts";
import { walkForwardPredictions } from "../../src/lib/server/models/fit.ts";
import type { CompletedGame, PricedGame } from "../../src/lib/server/models/games.ts";
import { fitArtifact } from "../../src/lib/server/models/train.ts";

function game(id: string, kickoff: string, homeScore = 20, awayScore = 10): PricedGame {
  return {
    id,
    kickoff,
    home: `${id}-home`,
    away: `${id}-away`,
    homeScore,
    awayScore,
    prices: {
      spread: { line: 0, home: { american: -110 }, away: { american: -110 } },
      total: { line: 44, over: { american: -110 }, under: { american: -110 } },
    },
  };
}

const training = [
  game("old-a", "2024-09-01T17:00:00Z", 30, 10),
  game("old-b", "2024-09-08T17:00:00Z", 10, 20),
  game("old-c", "2024-09-15T17:00:00Z", 21, 17),
];

describe("decision-time model chronology", () => {
  it("keeps concurrent pregame features and scored probabilities independent of scores and ordering", () => {
    const artifact = fitArtifact(training, "2024-09-17T00:00:00Z");
    const a = game("a", "2024-09-22T17:00:00Z", 80, 0);
    const b = game("b", a.kickoff);
    const input = [...training, a, b];
    const changed = [...training, b, { ...a, homeScore: 0, awayScore: 0 }];
    const rows = buildFeatureRows(input);
    const changedRows = buildFeatureRows(changed);
    expect(changedRows.find((row) => row.gameId === b.id)).toEqual(
      rows.find((row) => row.gameId === b.id),
    );
    expect(buildFeatureRows([...input].reverse())).toEqual(rows);
    const forecast = (games: CompletedGame[]) =>
      scoreHoldout(artifact, buildFeatureRows(games), games).find(
        (row) => row.gameId === b.id && row.market === "moneyline",
      );
    expect(forecast(changed)?.probability).toEqual(forecast(input)?.probability);
  });

  it("excludes overlapping and exact-boundary results, then uses explicitly available history", () => {
    const past = {
      ...game("past", "2024-09-22T17:00:00Z", 30, 10),
      resultAvailableAt: "2024-09-22T21:00:00Z",
    };
    const upcoming = {
      id: "next",
      home: past.home,
      away: "new",
      kickoff: "2024-09-23T22:00:00Z",
    };
    for (const cutoff of ["2024-09-22T18:00:00Z", past.resultAvailableAt]) {
      const row = featureRowForGame([past], upcoming, undefined, cutoff);
      expect(row.features.home_prior_margin).toBe(0);
      expect(row.features.home_prior_points_for).toBe(0);
    }
    expect(
      featureRowForGame([past], upcoming, undefined, "2024-09-22T21:00:00.001Z").features
        .home_prior_margin,
    ).toBeCloseTo(20 / 3);
    const unknown = game("unknown", "2024-09-22T17:00:00Z", 30, 10);
    const target = { ...upcoming, home: unknown.home };
    expect(
      featureRowForGame([unknown], target, undefined, "2024-09-23T17:00:00Z").features
        .home_prior_margin,
    ).toBe(0);
    expect(
      featureRowForGame([unknown], target, undefined, "2024-09-23T17:00:00.001Z").features
        .home_prior_margin,
    ).toBeCloseTo(20 / 3);
  });

  it("fits only outcomes available strictly before its cutoff", () => {
    const cutoff = "2024-09-22T21:00:00Z";
    const overlap = {
      ...game("overlap", "2024-09-22T17:00:00Z", 90, 0),
      resultAvailableAt: cutoff,
    };
    const original = fitArtifact([...training, overlap], cutoff);
    const changed = fitArtifact([...training, { ...overlap, homeScore: 0, awayScore: 90 }], cutoff);
    expect(original.margin).toEqual(changed.margin);
    expect(original.total).toEqual(changed.total);
    expect(original.baseRates.moneyline).toEqual({
      win: 2 / 3,
      loss: 1 / 3,
      push: 0,
    });
  });

  it("keeps kickoff groups intact when fitting walk-forward predictions", () => {
    const games = Array.from({ length: 12 }, (_, index) =>
      game(`g${index}`, new Date(Date.UTC(2024, 8, 1 + Math.floor(index / 3) * 7)).toISOString()),
    );
    const rows = buildFeatureRows(games);
    const targets = [2, 2, 2, 20, 40, 60, 80, 100, 120, 140, 160, 180];
    const predictions = walkForwardPredictions(rows, targets, 1, 5);
    expect(predictions.map((entry) => entry.index)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const index of [3, 4, 5]) {
      expect(predictions.find((entry) => entry.index === index)?.mean).toBeCloseTo(2);
    }
    for (const kickoff of new Set(rows.map((row) => row.kickoff))) {
      const blocks = predictions
        .filter((entry) => rows[entry.index]?.kickoff === kickoff)
        .map((entry) => entry.block);
      expect(new Set(blocks).size).toBeLessThanOrEqual(1);
    }
  });

  it("excludes an overlapping previous group's outcomes from fold fitting", () => {
    const games = [
      ...Array.from({ length: 3 }, (_, i) => game(`old${i}`, "2024-09-01T17:00:00Z", 12, 10)),
      ...Array.from({ length: 3 }, (_, i) => game(`pending${i}`, "2024-09-08T17:00:00Z", 90, 0)),
      ...Array.from({ length: 3 }, (_, i) => game(`next${i}`, "2024-09-08T20:00:00Z")),
    ];
    const rows = buildFeatureRows(games);
    const predictions = walkForwardPredictions(rows, [2, 2, 2, 90, 90, 90, 10, 10, 10], 1, 3);
    for (const index of [6, 7, 8]) {
      expect(predictions.find((entry) => entry.index === index)?.mean).toBeCloseTo(2);
    }
  });

  it("does not claim walk-forward residuals when all training games share one kickoff", () => {
    const games = Array.from({ length: 45 }, (_, index) =>
      game(`same${index}`, "2024-09-01T17:00:00Z"),
    );
    const artifact = fitArtifact(games, "2024-09-04T00:00:00Z");
    expect(artifact.residualSource).toBe("in-sample");
    expect(artifact.uncertainty.markets.moneyline.every((bin) => bin.sides === 0)).toBe(true);
  });

  it("leaves calibration empty when every earlier forecast outcome is unavailable", () => {
    const games = [
      ...Array.from({ length: 10 }, (_, i) => game(`old${i}`, "2024-09-01T17:00:00Z", 12, 10)),
      ...Array.from({ length: 40 }, (_, i) =>
        game(`overlap${i}`, new Date(Date.UTC(2024, 8, 8, 17 + Math.floor(i / 10))).toISOString()),
      ),
    ];
    const artifact = fitArtifact(games, "2024-09-11T00:00:00Z");
    expect(artifact.residualSource).toBe("walk-forward");
    expect(artifact.uncertainty.markets.moneyline.every((bin) => bin.sides === 0)).toBe(true);
  });
});
