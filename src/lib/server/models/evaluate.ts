import {
  moneylineFromMargin,
  totalFromDistribution,
  type SideProbability,
} from "./distribution.ts";
import type { FeatureRow } from "./features.ts";
import type { HistoricalPrices, PricedGame } from "./games.ts";
import { marginHome, totalPoints } from "./games.ts";
import { predictGame, type GameProbabilities } from "./predict.ts";
import type { ModelArtifact } from "./artifact.ts";

export type Outcome = "win" | "loss" | "push";

export type ScoredForecast = {
  gameId: string;
  market: "moneyline" | "spread" | "total";
  side: string;
  probability: SideProbability;
  outcome: Outcome;
  priceState: "present" | "missing";
};

export type EvaluationSummary = {
  count: number;
  brier: number;
  logLoss: number;
  calibration: { lower: number; upper: number; count: number; observed: number }[];
  baseline: { name: string; brier: number; logLoss: number };
  coverage: { priced: number; missingPrices: number };
  byMarket: Record<string, { count: number; brier: number }>;
};

const EPS = 1e-12;

export function multiclassBrier(probability: SideProbability, outcome: Outcome): number {
  const predicted = { win: probability.win, loss: probability.loss, push: probability.push };
  return (["win", "loss", "push"] as const).reduce((sum, key) => {
    const target = outcome === key ? 1 : 0;
    return sum + (predicted[key] - target) ** 2;
  }, 0);
}

export function multiclassLogLoss(probability: SideProbability, outcome: Outcome): number {
  const chosen = probability[outcome];
  return -Math.log(Math.min(1 - EPS, Math.max(EPS, chosen)));
}

function homeFieldBaseline(): SideProbability {
  return { win: 0.57, loss: 0.4, push: 0.03 };
}

function settleMargin(margin: number, line = 0): Outcome {
  const value = margin + line;
  if (value > 0) return "win";
  if (value < 0) return "loss";
  return "push";
}

function settleTotal(total: number, line: number): Outcome {
  if (total > line) return "win";
  if (total < line) return "loss";
  return "push";
}

export function scoreHoldout(
  artifact: ModelArtifact,
  rows: readonly FeatureRow[],
  games: readonly PricedGame[],
): ScoredForecast[] {
  const byId = new Map(games.map((game) => [game.id, game]));
  const forecasts: ScoredForecast[] = [];
  for (const row of rows) {
    const game = byId.get(row.gameId);
    if (!game) continue;
    const predicted = predictGame(artifact, row);
    const prices = game.prices ?? null;
    forecasts.push(moneylineForecast(game, predicted, prices));
    if (prices?.spread) {
      const spread = predicted.spread(prices.spread.line);
      forecasts.push({
        gameId: game.id,
        market: "spread",
        side: "home",
        probability: spread.home,
        outcome: settleMargin(marginHome(game), prices.spread.line),
        priceState: "present",
      });
    } else {
      forecasts.push(missing("spread", game.id));
    }
    if (prices?.total) {
      const total = predicted.total(prices.total.line);
      forecasts.push({
        gameId: game.id,
        market: "total",
        side: "over",
        probability: total.over,
        outcome: settleTotal(totalPoints(game), prices.total.line),
        priceState: "present",
      });
    } else {
      forecasts.push(missing("total", game.id));
    }
  }
  return forecasts;
}

function moneylineForecast(
  game: PricedGame,
  predicted: GameProbabilities,
  prices: HistoricalPrices | null,
): ScoredForecast {
  return {
    gameId: game.id,
    market: "moneyline",
    side: "home",
    probability: predicted.moneyline.home,
    outcome: settleMargin(marginHome(game)),
    priceState: prices?.moneyline ? "present" : "missing",
  };
}

function missing(market: "spread" | "total", gameId: string): ScoredForecast {
  return {
    gameId,
    market,
    side: market === "spread" ? "home" : "over",
    probability: { win: 0, loss: 0, push: 0 },
    outcome: "push",
    priceState: "missing",
  };
}

export function summarize(
  forecasts: readonly ScoredForecast[],
  _games: readonly PricedGame[],
): EvaluationSummary {
  const graded = forecasts.filter(
    (forecast) => forecast.market === "moneyline" || forecast.priceState === "present",
  );
  const brier = average(
    graded.map((forecast) => multiclassBrier(forecast.probability, forecast.outcome)),
  );
  const logLoss = average(
    graded.map((forecast) => multiclassLogLoss(forecast.probability, forecast.outcome)),
  );
  const baselineScores = graded
    .filter((forecast) => forecast.market === "moneyline")
    .map((forecast) => {
      const baseline = homeFieldBaseline();
      return {
        brier: multiclassBrier(baseline, forecast.outcome),
        logLoss: multiclassLogLoss(baseline, forecast.outcome),
      };
    });
  const bins = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const calibration = bins.slice(0, -1).map((lower, index) => {
    const upper = bins[index + 1] ?? 1;
    const members = graded.filter((forecast) => {
      const probability = forecast.probability.win;
      return (
        probability >= lower &&
        (index === bins.length - 2 ? probability <= upper : probability < upper)
      );
    });
    return {
      lower,
      upper,
      count: members.length,
      observed:
        members.length === 0
          ? 0
          : members.filter((forecast) => forecast.outcome === "win").length / members.length,
    };
  });
  const markets = ["moneyline", "spread", "total"] as const;
  const byMarket: EvaluationSummary["byMarket"] = {};
  for (const market of markets) {
    const members = graded.filter((forecast) => forecast.market === market);
    byMarket[market] = {
      count: members.length,
      brier: average(
        members.map((forecast) => multiclassBrier(forecast.probability, forecast.outcome)),
      ),
    };
  }
  const priced = forecasts.filter((forecast) => forecast.priceState === "present").length;
  return {
    count: graded.length,
    brier,
    logLoss,
    calibration,
    baseline: {
      name: "constant-home-field",
      brier: average(baselineScores.map((score) => score.brier)),
      logLoss: average(baselineScores.map((score) => score.logLoss)),
    },
    coverage: {
      priced,
      missingPrices: forecasts.filter((forecast) => forecast.priceState === "missing").length,
    },
    byMarket,
  };
}

function average(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function sameMarginDistribution(predicted: GameProbabilities, homeLine: number): boolean {
  const fromBins = moneylineFromMargin(predicted.marginBins).home;
  const spread = predicted.spread(homeLine).home;
  const total = totalFromDistribution(predicted.totalBins, 0).over;
  return (
    nearly(fromBins, predicted.moneyline.home) &&
    spread.win + spread.loss + spread.push > 0.99 &&
    total.win !== predicted.moneyline.home.win
  );
}

function nearly(left: SideProbability, right: SideProbability): boolean {
  return Math.abs(left.win - right.win) < 1e-9 && Math.abs(left.push - right.push) < 1e-9;
}
