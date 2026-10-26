import { americanToDecimal, expectedValue, proportionalMargin } from "../../domain/odds.ts";
import { VALUE_THRESHOLD } from "../../domain/threshold.ts";
import type { ModelArtifact } from "./artifact.ts";
import type { SideProbability } from "./distribution.ts";
import type { FeatureRow } from "./features.ts";
import type { Market, PricedGame, PriceSide } from "./games.ts";
import { marginHome, totalPoints } from "./games.ts";
import { predictGame } from "./predict.ts";
import {
  clusteredInterval,
  conservativeProbabilities,
  slateOf,
  UNCERTAINTY_OPTIONS,
} from "./uncertainty.ts";

export type Outcome = "win" | "loss" | "push";

export type ScoredForecast = {
  gameId: string;
  market: Market;
  side: string;
  probability: SideProbability;
  /** The no-vig closing price for the same side, carrying the model's push mass. Null without a price. */
  marketBaseline: SideProbability | null;
  /** Training-window home win, loss, and tie rates. Moneyline only, since it needs no price. */
  baseRate: SideProbability | null;
  outcome: Outcome;
  priceState: "present" | "missing";
  slate: string;
  /** This side's closing price, when recorded. */
  americanOdds: number | null;
  /** Expected value per unit at the closing price from conservative probabilities. Null when unavailable. */
  conservativeExpectedValue: number | null;
};

type Scores = { brier: number; logLoss: number };

export type BaselineComparison = {
  market: Market;
  name: "training-base-rate" | "market-no-vig";
  count: number;
  model: Scores;
  baseline: Scores;
  logLossDifferenceInterval: [number, number] | null;
};

export type EvaluationSummary = {
  count: number;
  brier: number;
  logLoss: number;
  calibration: { lower: number; upper: number; count: number; observed: number }[];
  baselines: BaselineComparison[];
  coverage: { priced: number; missingPrices: number };
  byMarket: Record<string, { count: number; brier: number }>;
  threshold: {
    version: string;
    conservativeExpectedValue: number;
    note: string;
    markets: Record<
      Market,
      {
        assessed: number;
        candidates: number;
        decisive: number;
        wins: number;
        observedRate: number | null;
        meanBreakEven: number | null;
        interval: [number, number] | null;
      }
    >;
  };
};

const EPS = 1e-12;

/** What model:evaluate writes, and what model:release reads back. */
export type EvaluationReport = {
  version: 1;
  datasetHash: string;
  trainingCutoff: string;
  holdoutGames: number;
  artifactChecksum: string;
  summary: EvaluationSummary;
};

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

export function settleMargin(margin: number, line = 0): Outcome {
  const value = margin + line;
  if (value > 0) return "win";
  if (value < 0) return "loss";
  return "push";
}

export function settleTotal(total: number, line: number): Outcome {
  if (total > line) return "win";
  if (total < line) return "loss";
  return "push";
}

/** Removes the vig proportionally and leaves room for the model's push probability. */
function noVig(side: PriceSide, other: PriceSide, push: number): SideProbability | null {
  const fair = proportionalMargin([
    { side: "side", american: side.american },
    { side: "other", american: other.american },
  ]);
  if (!fair.available) return null;
  const win = fair.probabilities.side ?? 0;
  return { win: win * (1 - push), loss: (1 - win) * (1 - push), push };
}

function conservativeValue(
  artifact: ModelArtifact,
  market: Market,
  probability: SideProbability,
  american: number | null,
): number | null {
  if (american === null) return null;
  const assessed = conservativeProbabilities(artifact.uncertainty, market, probability);
  if (!assessed.available) return null;
  return expectedValue({
    decimalOdds: americanToDecimal(american),
    probabilities: assessed.probabilities,
    illustrative: true,
  }).perUnit;
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
    const slate = slateOf(game.kickoff);
    const moneyline = predicted.moneyline.home;
    const moneylineOdds = prices?.moneyline?.home.american ?? null;
    forecasts.push({
      gameId: game.id,
      market: "moneyline",
      side: "home",
      probability: moneyline,
      marketBaseline: prices?.moneyline
        ? noVig(prices.moneyline.home, prices.moneyline.away, moneyline.push)
        : null,
      baseRate: artifact.baseRates.moneyline,
      outcome: settleMargin(marginHome(game)),
      priceState: prices?.moneyline ? "present" : "missing",
      slate,
      americanOdds: moneylineOdds,
      conservativeExpectedValue: conservativeValue(artifact, "moneyline", moneyline, moneylineOdds),
    });
    if (prices?.spread) {
      const spread = predicted.spread(prices.spread.line).home;
      forecasts.push({
        gameId: game.id,
        market: "spread",
        side: "home",
        probability: spread,
        marketBaseline: noVig(prices.spread.home, prices.spread.away, spread.push),
        baseRate: null,
        outcome: settleMargin(marginHome(game), prices.spread.line),
        priceState: "present",
        slate,
        americanOdds: prices.spread.home.american,
        conservativeExpectedValue: conservativeValue(
          artifact,
          "spread",
          spread,
          prices.spread.home.american,
        ),
      });
    } else {
      forecasts.push(missing("spread", game.id, slate));
    }
    if (prices?.total) {
      const total = predicted.total(prices.total.line).over;
      forecasts.push({
        gameId: game.id,
        market: "total",
        side: "over",
        probability: total,
        marketBaseline: noVig(prices.total.over, prices.total.under, total.push),
        baseRate: null,
        outcome: settleTotal(totalPoints(game), prices.total.line),
        priceState: "present",
        slate,
        americanOdds: prices.total.over.american,
        conservativeExpectedValue: conservativeValue(
          artifact,
          "total",
          total,
          prices.total.over.american,
        ),
      });
    } else {
      forecasts.push(missing("total", game.id, slate));
    }
  }
  return forecasts;
}

function missing(market: "spread" | "total", gameId: string, slate: string): ScoredForecast {
  return {
    gameId,
    market,
    side: market === "spread" ? "home" : "over",
    probability: { win: 0, loss: 0, push: 0 },
    marketBaseline: null,
    baseRate: null,
    outcome: "push",
    priceState: "missing",
    slate,
    americanOdds: null,
    conservativeExpectedValue: null,
  };
}

function scores(
  members: readonly ScoredForecast[],
  probability: (forecast: ScoredForecast) => SideProbability,
): Scores {
  return {
    brier: average(
      members.map((forecast) => multiclassBrier(probability(forecast), forecast.outcome)),
    ),
    logLoss: average(
      members.map((forecast) => multiclassLogLoss(probability(forecast), forecast.outcome)),
    ),
  };
}

function differenceInterval(
  members: readonly ScoredForecast[],
  baseline: (forecast: ScoredForecast) => SideProbability,
): [number, number] | null {
  const bySlate = new Map<string, number[]>();
  for (const forecast of members) {
    const difference =
      multiclassLogLoss(forecast.probability, forecast.outcome) -
      multiclassLogLoss(baseline(forecast), forecast.outcome);
    bySlate.set(forecast.slate, [...(bySlate.get(forecast.slate) ?? []), difference]);
  }
  return clusteredInterval(
    [...bySlate.values()],
    (sample) => {
      const all = sample.flat();
      return all.length === 0 ? null : all.reduce((sum, value) => sum + value, 0) / all.length;
    },
    UNCERTAINTY_OPTIONS,
  );
}

function winRate(sample: readonly ScoredForecast[][]): number | null {
  const forecasts = sample.flat().filter((forecast) => forecast.outcome !== "push");
  if (forecasts.length === 0) return null;
  return forecasts.filter((forecast) => forecast.outcome === "win").length / forecasts.length;
}

const THRESHOLD_NOTE =
  "Descriptive only. Closing prices stand in for the offer here, and the spec forbids treating closing prices as executable; the threshold was frozen before this report and is not tuned on it.";

function thresholdReport(
  members: readonly ScoredForecast[],
): EvaluationSummary["threshold"]["markets"][Market] {
  const assessed = members.filter((forecast) => forecast.conservativeExpectedValue !== null);
  const candidates = assessed.filter(
    (forecast) => forecast.conservativeExpectedValue! > VALUE_THRESHOLD.conservativeExpectedValue,
  );
  const decisive = candidates.filter((forecast) => forecast.outcome !== "push");
  const wins = decisive.filter((forecast) => forecast.outcome === "win");
  const breakEvens = candidates.flatMap((forecast) =>
    forecast.americanOdds === null ? [] : [1 / americanToDecimal(forecast.americanOdds)],
  );
  const bySlate = new Map<string, ScoredForecast[]>();
  for (const forecast of candidates) {
    bySlate.set(forecast.slate, [...(bySlate.get(forecast.slate) ?? []), forecast]);
  }
  return {
    assessed: assessed.length,
    candidates: candidates.length,
    decisive: decisive.length,
    wins: wins.length,
    observedRate: decisive.length === 0 ? null : wins.length / decisive.length,
    meanBreakEven:
      breakEvens.length === 0
        ? null
        : breakEvens.reduce((sum, value) => sum + value, 0) / breakEvens.length,
    interval: clusteredInterval([...bySlate.values()], winRate, UNCERTAINTY_OPTIONS),
  };
}

export function summarize(forecasts: readonly ScoredForecast[]): EvaluationSummary {
  const graded = forecasts.filter(
    (forecast) => forecast.market === "moneyline" || forecast.priceState === "present",
  );
  const overall = scores(graded, (forecast) => forecast.probability);
  const bins = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const calibration = bins.slice(0, -1).map((lower, index) => {
    const upper = bins[index + 1] ?? 1;
    const members = graded.filter((forecast) => {
      const probability = forecast.probability.win;
      // The top bin also takes values a rounding error above 1.
      return probability >= lower && (index === bins.length - 2 || probability < upper);
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
      brier: scores(members, (forecast) => forecast.probability).brier,
    };
  }

  const baselines: BaselineComparison[] = [];
  const rated = graded.filter((forecast) => forecast.baseRate !== null);
  if (rated.length > 0) {
    baselines.push({
      market: "moneyline",
      name: "training-base-rate",
      count: rated.length,
      model: scores(rated, (forecast) => forecast.probability),
      baseline: scores(rated, (forecast) => forecast.baseRate!),
      logLossDifferenceInterval: differenceInterval(rated, (forecast) => forecast.baseRate!),
    });
  }
  for (const market of markets) {
    const members = graded.filter(
      (forecast) => forecast.market === market && forecast.marketBaseline !== null,
    );
    if (members.length === 0) continue;
    baselines.push({
      market,
      name: "market-no-vig",
      count: members.length,
      model: scores(members, (forecast) => forecast.probability),
      baseline: scores(members, (forecast) => forecast.marketBaseline!),
      logLossDifferenceInterval: differenceInterval(
        members,
        (forecast) => forecast.marketBaseline!,
      ),
    });
  }

  const priced = forecasts.filter((forecast) => forecast.priceState === "present").length;
  const thresholdMarkets = {} as EvaluationSummary["threshold"]["markets"];
  for (const market of markets) {
    thresholdMarkets[market] = thresholdReport(
      graded.filter((forecast) => forecast.market === market),
    );
  }
  return {
    count: graded.length,
    brier: overall.brier,
    logLoss: overall.logLoss,
    calibration,
    baselines,
    coverage: {
      priced,
      missingPrices: forecasts.filter((forecast) => forecast.priceState === "missing").length,
    },
    byMarket,
    threshold: {
      version: VALUE_THRESHOLD.version,
      conservativeExpectedValue: VALUE_THRESHOLD.conservativeExpectedValue,
      note: THRESHOLD_NOTE,
      markets: thresholdMarkets,
    },
  };
}

function average(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
