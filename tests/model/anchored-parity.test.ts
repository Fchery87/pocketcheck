import { describe, expect, it } from "vite-plus/test";
import { fitArtifact } from "../../src/lib/server/models/train.ts";
import { predictMean } from "../../src/lib/server/models/fit.ts";
import { predictGame } from "../../src/lib/server/models/predict.ts";
import { offerProbabilities } from "../../src/lib/server/models/offer-probability.ts";
import { freezeProspectiveForecast } from "../../src/lib/server/models/forecast.ts";
import { scoreHoldout } from "../../src/lib/server/models/evaluate.ts";
import { featureRowForGame } from "../../src/lib/server/models/features.ts";
import { fitResidualDistribution } from "../../src/lib/server/models/distribution.ts";
import { anchorFromQuote } from "../../src/lib/server/models/anchor.ts";
import { integerMass, moneylineFromMargin } from "../../src/lib/server/models/distribution.ts";
import type { PricedGame } from "../../src/lib/server/models/games.ts";
import type { Offer } from "../../src/lib/domain/offer.ts";

const history: PricedGame[] = Array.from({ length: 60 }, (_, index) => ({
  id: `g${index}`,
  kickoff: new Date(Date.UTC(2020, 0, 1) + index * 7 * 86_400_000).toISOString(),
  home: `h${index}`,
  away: `a${index}`,
  homeScore: 24 + (index % 3) - 1,
  awayScore: 20,
  prices: {
    moneyline: { home: { american: -150 }, away: { american: 130 } },
    spread: { line: -3, home: { american: -110 }, away: { american: -110 } },
    total: { line: 44, over: { american: -110 }, under: { american: -110 } },
  },
}));
const fitted = fitArtifact(history, "2022-01-01T00:00:00Z");
const game = { id: "next", kickoff: "2022-01-09T17:00:00Z", home: "new-h", away: "new-a" };
const cutoff = "2022-01-08T17:00:00Z";
function offer(market: Offer["market"], tie: Offer["rules"]["tie"] = "push"): Offer {
  return {
    gameId: game.id,
    sportsbook: "book",
    market,
    selection: market === "total" ? "over" : "home",
    pointLine: market === "total" ? 44 : market === "spread" ? -3 : null,
    americanOdds: -110,
    decimalOdds: 21 / 11,
    observedAt: cutoff,
    kickoffAt: game.kickoff,
    rules: { period: "full-game", overtime: "included", tie },
    opposing: null,
  };
}
function freeze(artifact: typeof fitted, terms: Offer) {
  return freezeProspectiveForecast({
    artifact,
    history,
    game,
    cutoff,
    offer: terms,
    anchorQuote: {
      homeAmerican: terms.market === "moneyline" ? -150 : -110,
      awayAmerican: terms.market === "moneyline" ? 130 : -110,
      ...(terms.pointLine === null ? {} : { line: terms.pointLine }),
    },
    policyVersion: "test",
  });
}

describe("anchored public probability parity", { timeout: 60_000 }, () => {
  it("anchors an even moneyline symmetrically when ties return the stake", () => {
    const distribution = fitResidualDistribution([-2, -1, 0, 1, 2], 1);
    const anchor = anchorFromQuote(
      "moneyline",
      {
        sportsbook: "book",
        homeAmerican: -110,
        awayAmerican: -110,
      },
      distribution,
    );
    const home = moneylineFromMargin(integerMass(distribution, anchor.mean)).home;
    expect(home.push).toBeGreaterThan(0);
    expect(home.win / (home.win + home.loss)).toBeCloseTo(0.5, 12);
  });
  it("fits a short total history independently of a longer margin history", () => {
    const partial = history.map((game, index) => ({
      ...game,
      prices: { ...game.prices, ...(index >= 20 ? { total: undefined } : {}) },
    }));
    const artifact = fitArtifact(partial, "2022-01-01T00:00:00Z");
    expect(artifact.total.residuals.residuals).toHaveLength(20);
    expect(artifact.uncertainty.markets.total.every((bin) => bin.sides === 0)).toBe(true);
    expect(artifact.uncertainty.markets.moneyline.some((bin) => bin.sides > 0)).toBe(true);
  });
  it.each(["moneyline", "spread", "total"] as const)(
    "uses the same %s adjustment in historical and frozen forecasts",
    (market) => {
      const artifact = structuredClone(fitted);
      artifact.margin.model.intercept = 4;
      artifact.total.model.intercept = -5;
      const frozen = freeze(artifact, offer(market));
      const row = featureRowForGame(history, game, artifact.featureParameters, cutoff);
      const expected = offerProbabilities(
        predictGame(
          artifact,
          row,
          market === "total"
            ? {
                totalAnchor: {
                  mean: frozen.anchor!.mean,
                  adjustment: predictMean(artifact.total.model, row),
                },
              }
            : {
                marginAnchor: {
                  mean: frozen.anchor!.mean,
                  adjustment: predictMean(artifact.margin.model, row),
                },
              },
        ),
        offer(market),
      );
      expect(frozen.probabilities).toEqual(expected);
      const historical = scoreHoldout(
        artifact,
        [row],
        [{ ...game, homeScore: 24, awayScore: 20, prices: history[0]!.prices }],
      );
      expect(historical.find((entry) => entry.market === market)!.probability).toEqual(
        frozen.probabilities,
      );
    },
  );

  it("keeps a zero-adjustment symmetric total symmetric after removing pushes", () => {
    const artifact = structuredClone(fitted);
    artifact.total.model.intercept = 0;
    artifact.total.residuals = fitResidualDistribution([-2, -1, 0, 1, 2], 1);
    const probability = freeze(artifact, offer("total")).probabilities;
    expect(probability.push).toBeGreaterThan(0);
    expect(probability.win / (1 - probability.push)).toBeCloseTo(0.5, 12);
    expect(probability.loss).toBeCloseTo(probability.win, 12);
    const populated = fitted.uncertainty.markets.total.filter((bin) => bin.sides > 0);
    expect(populated.length).toBeGreaterThan(0);
    for (const bin of populated) expect(bin.meanPredicted).toBeCloseTo(0.5, 12);
  });

  it("applies moneyline tie rules to the frozen contract without losing mass", () => {
    const push = freeze(fitted, offer("moneyline", "push")).probabilities;
    expect(push.push).toBeGreaterThan(0);
    expect(freeze(fitted, offer("moneyline", "void")).probabilities).toEqual(push);
    expect(freeze(fitted, offer("moneyline", "loss")).probabilities).toEqual({
      win: push.win,
      loss: push.loss + push.push,
      push: 0,
    });
    expect(freeze(fitted, offer("moneyline", "win")).probabilities).toEqual({
      win: push.win + push.push,
      loss: push.loss,
      push: 0,
    });
  });
});
