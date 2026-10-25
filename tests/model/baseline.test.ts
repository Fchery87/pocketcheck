import { describe, expect, it } from "vite-plus/test";
import { valueEligibility } from "../../src/lib/server/models/artifact.ts";
import { integerMass, moneylineFromMargin, spreadFromMargin } from "../../src/lib/server/models/distribution.ts";
import { buildFeatureRows } from "../../src/lib/server/models/features.ts";
import type { CompletedGame, PricedGame } from "../../src/lib/server/models/games.ts";
import { predictGame } from "../../src/lib/server/models/predict.ts";
import { scoreHoldout, summarize } from "../../src/lib/server/models/evaluate.ts";
import { fitArtifact } from "../../src/lib/server/models/train.ts";
import { readFileSync } from "node:fs";

const early: CompletedGame = {
  id: "early",
  kickoff: "2024-09-08T17:00:00Z",
  home: "A",
  away: "B",
  homeScore: 21,
  awayScore: 7,
};

const later: CompletedGame = {
  id: "later",
  kickoff: "2024-09-15T17:00:00Z",
  home: "A",
  away: "C",
  homeScore: 3,
  awayScore: 40,
};

describe("prior-game features", () => {
  it("does not let a later result change an earlier feature row", () => {
    const before = buildFeatureRows([early]);
    const after = buildFeatureRows([later, early]);
    expect(after.find((row) => row.gameId === "early")).toEqual(before[0]);
    const laterRow = after.find((row) => row.gameId === "later");
    expect(laterRow?.features.home_prior_margin).toBe(14);
    expect(before[0]?.features.home_prior_margin).toBe(0);
  });
});

describe("integer distributions", () => {
  it("keeps tie and push mass instead of treating a mean as a cover probability", () => {
    const games = JSON.parse(readFileSync(new URL("./fixtures/synthetic-games.json", import.meta.url), "utf8"))
      .games as PricedGame[];
    const artifact = fitArtifact(games, "2024-09-15T20:00:00Z");
    const rows = buildFeatureRows(games);
    const row = rows.find((item) => item.gameId === "g5");
    expect(row).toBeTruthy();
    const predicted = predictGame(artifact, row!);
    const tie = predicted.marginBins.find((bin) => bin.points === 0);
    expect(tie?.probability).toBeGreaterThan(0);
    const mass = predicted.marginBins.reduce((sum, bin) => sum + bin.probability, 0);
    expect(mass).toBeCloseTo(1, 6);
    const moneyline = moneylineFromMargin(predicted.marginBins).home;
    expect(moneyline.win + moneyline.loss + moneyline.push).toBeCloseTo(1, 6);
    const spread = predicted.spread(-7).home;
    expect(spread.push).toBeGreaterThan(0);
    expect(spread.push).not.toBe(moneyline.push);
    const sameBins = spreadFromMargin(predicted.marginBins, -7).home;
    expect(sameBins).toEqual(spread);
    expect(predicted.marginMean).not.toBe(spread.win);
    expect(artifact.releaseStatus).toBe("unreleased");
    expect(valueEligibility(artifact).eligible).toBe(false);
  });
});

describe("evaluation", () => {
  it("reports scores, calibration counts, a baseline, and missing prices", () => {
    const games = JSON.parse(readFileSync(new URL("./fixtures/synthetic-games.json", import.meta.url), "utf8"))
      .games as PricedGame[];
    const artifact = fitArtifact(games, "2024-09-15T20:00:00Z");
    const holdout = buildFeatureRows(games).filter((row) => row.kickoff > artifact.trainingCutoff);
    const forecasts = scoreHoldout(artifact, holdout, games);
    const summary = summarize(forecasts, games);
    expect(summary.brier).toBeGreaterThan(0);
    expect(summary.logLoss).toBeGreaterThan(0);
    expect(summary.calibration.reduce((sum, bin) => sum + bin.count, 0)).toBe(summary.count);
    expect(summary.baseline.name).toBe("constant-home-field");
    expect(summary.coverage.missingPrices).toBeGreaterThan(0);
    expect(forecasts.some((forecast) => forecast.priceState === "missing" && forecast.market !== "moneyline")).toBe(true);
    expect(artifact.datasetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.featureDefinitions.length).toBeGreaterThan(0);
  });
});

describe("smoothed bins", () => {
  it("places positive probability on the integer nearest a residual of zero", () => {
    const bins = integerMass(
      { residuals: [0], bandwidth: 1, support: { min: -2, max: 2 } },
      0,
    );
    const zero = bins.find((bin) => bin.points === 0);
    const edge = bins.find((bin) => bin.points === 2);
    expect(zero && edge && zero.probability > edge.probability).toBe(true);
  });
});
