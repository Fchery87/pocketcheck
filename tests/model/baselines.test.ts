import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { proportionalMargin } from "../../src/lib/domain/odds.ts";
import { scoreHoldout, summarize } from "../../src/lib/server/models/evaluate.ts";
import { buildFeatureRows } from "../../src/lib/server/models/features.ts";
import type { PricedGame } from "../../src/lib/server/models/games.ts";
import { fitArtifact } from "../../src/lib/server/models/train.ts";

const games = JSON.parse(
  readFileSync(new URL("./fixtures/synthetic-games.json", import.meta.url), "utf8"),
).games as PricedGame[];
const CUTOFF = "2024-09-15T20:00:00Z";

describe("baselines that are not constant", () => {
  const artifact = fitArtifact(games, CUTOFF);
  const holdout = buildFeatureRows(games, artifact.featureParameters).filter(
    (row) => row.kickoff > artifact.trainingCutoff,
  );
  const forecasts = scoreHoldout(artifact, holdout, games);

  it("records home win, loss, and tie rates from the training window only", () => {
    // Only g1 and g2 have cleared the conservative availability delay at this cutoff.
    expect(artifact.baseRates.moneyline).toEqual({
      win: 0.5,
      loss: 0,
      push: 0.5,
    });
  });

  it("prices each forecast against the no-vig market, keeping the model's push mass", () => {
    const priced = forecasts.find(
      (forecast) => forecast.market === "moneyline" && forecast.priceState === "present",
    );
    expect(priced?.marketBaseline).toBeTruthy();
    const game = games.find((item) => item.id === priced!.gameId)!;
    const fair = proportionalMargin([
      { side: "home", american: game.prices!.moneyline!.home.american },
      { side: "away", american: game.prices!.moneyline!.away.american },
    ]);
    if (!fair.available) throw new Error("fixture moneyline should be complete");
    const push = priced!.probability.push;
    expect(priced!.marketBaseline!.win).toBeCloseTo(fair.probabilities.home! * (1 - push), 12);
    expect(priced!.marketBaseline!.loss).toBeCloseTo(fair.probabilities.away! * (1 - push), 12);
    expect(priced!.marketBaseline!.push).toBe(push);

    const unpriced = forecasts.find((forecast) => forecast.priceState === "missing");
    expect(unpriced?.marketBaseline).toBeNull();
  });

  it("compares the model with each baseline on the same forecasts", () => {
    const summary = summarize(forecasts);
    const names = summary.baselines.map((baseline) => `${baseline.market}:${baseline.name}`);
    expect(names).toEqual([
      "moneyline:training-base-rate",
      "moneyline:market-no-vig",
      "spread:market-no-vig",
      "total:market-no-vig",
    ]);
    const marketMoneyline = summary.baselines[1]!;
    const pricedMoneylines = forecasts.filter(
      (forecast) => forecast.market === "moneyline" && forecast.marketBaseline,
    );
    expect(marketMoneyline.count).toBe(pricedMoneylines.length);
    expect(marketMoneyline.model.brier).toBeGreaterThan(0);
    expect(marketMoneyline.baseline.brier).toBeGreaterThan(0);
    expect(summary).not.toHaveProperty("baseline");
  });
});

describe("calibration counts", () => {
  it("counts a probability a rounding error above 1 in the top bin", () => {
    const summary = summarize([
      {
        gameId: "g",
        market: "moneyline",
        side: "home",
        probability: { win: 1.0000000000000002, loss: 0, push: 0 },
        marketBaseline: null,
        baseRate: null,
        outcome: "win",
        priceState: "missing",
      },
    ]);
    expect(summary.calibration.at(-1)?.count).toBe(1);
  });
});
