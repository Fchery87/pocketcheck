import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { teamSummariesFromSeasonFiles } from "../sources/play-by-play.ts";
import { attachEfficiency } from "./efficiency-join.ts";
import { datasetHash, withChecksum, type ModelArtifact } from "./artifact.ts";
import {
  fitResidualDistribution,
  anchoredMass,
  keyNumberWeights,
  moneylineFromMargin,
  spreadFromMargin,
  totalFromDistribution,
  type ResidualDistribution,
  type SideProbability,
} from "./distribution.ts";
import { settleMargin, settleTotal } from "./evaluate.ts";
import {
  buildFeatureRows,
  DEFAULT_FEATURES,
  FEATURE_DEFINITIONS,
  type FeatureParameters,
  type FeatureRow,
} from "./features.ts";
import {
  DEFAULT_FIT,
  fitRidge,
  predictMean,
  walkForwardPredictions,
  type LinearModel,
  type WalkForwardPrediction,
} from "./fit.ts";
import { anchorFromQuote, marginFromHomeLine } from "./anchor.ts";
import {
  CHRONOLOGY,
  kickoffMs,
  resultAvailableMs,
  marginHome,
  totalPoints,
  type Market,
  type PricedGame,
} from "./games.ts";
import { pricedGamesFromNflverseCsv } from "./history.ts";
import { TRAINING_CODE } from "./training-code.ts";
import { fitUncertainty, slateOf, type CalibrationSample } from "./uncertainty.ts";

/** Below this, walk-forward blocks are too small to fit, so residuals fall back to in-sample. */
const MIN_WALK_FORWARD_GAMES = 40;

function decisive(side: SideProbability): number {
  const total = side.win + side.loss;
  return total > 0 ? side.win / total : 0.5;
}

/**
 * Walk-forward forecasts for calibration. Block 1 has no earlier out-of-sample residuals, so
 * calibration starts at block 2. Every input to a block's forecast predates that block.
 */
function calibrationSamples(
  marginRows: readonly FeatureRow[],
  totalRows: readonly FeatureRow[],
  byId: ReadonlyMap<string, PricedGame>,
  margins: readonly WalkForwardPrediction[],
  totals: readonly WalkForwardPrediction[],
): CalibrationSample[] {
  const samples: CalibrationSample[] = [];
  const cache = new Map<string, ResidualDistribution>();
  const distributionFor = (
    predictions: readonly WalkForwardPrediction[],
    rows: readonly FeatureRow[],
    current: WalkForwardPrediction,
    useKeyNumbers: boolean,
  ): ResidualDistribution | null => {
    if (current.block < 2) return null;
    const key = `${useKeyNumbers ? "margin" : "total"}:${current.block}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const blockStart = predictions.find((entry) => entry.block === current.block);
    if (!blockStart) return null;
    const cutoff = kickoffMs(rows[blockStart.index]!);
    const earlier = predictions.filter(
      (entry) => entry.block < current.block && resultAvailableMs(rows[entry.index]!) < cutoff,
    );
    if (earlier.length === 0) return null;
    const earlierMargins = earlier.map((entry) => marginHome(byId.get(rows[entry.index]!.gameId)!));
    const distribution = fitResidualDistribution(
      earlier.map((entry) => entry.residual),
      DEFAULT_FIT.residualBandwidth,
      undefined,
      useKeyNumbers ? keyNumberWeights(earlierMargins) : undefined,
    );
    cache.set(key, distribution);
    return distribution;
  };
  for (const prediction of margins) {
    const distribution = distributionFor(margins, marginRows, prediction, true);
    if (!distribution) continue;
    const game = byId.get(marginRows[prediction.index]!.gameId)!;
    const slate = slateOf(game.kickoff);
    const margin = game.homeScore - game.awayScore;
    const moneylinePrice = game.prices?.moneyline;
    if (moneylinePrice) {
      const anchor = anchorFromQuote(
        "moneyline",
        {
          sportsbook: "close",
          homeAmerican: moneylinePrice.home.american,
          awayAmerican: moneylinePrice.away.american,
        },
        distribution,
      );
      const moneyline = moneylineFromMargin(
        anchoredMass(distribution, anchor.mean, prediction.mean),
      );
      samples.push(
        {
          market: "moneyline",
          slate,
          decisiveWin: decisive(moneyline.home),
          outcome: settleMargin(margin),
        },
        {
          market: "moneyline",
          slate,
          decisiveWin: decisive(moneyline.away),
          outcome: settleMargin(-margin),
        },
      );
    }
    const spreadPrice = game.prices?.spread;
    if (spreadPrice) {
      const spread = spreadFromMargin(
        anchoredMass(distribution, marginFromHomeLine(spreadPrice.line), prediction.mean),
        spreadPrice.line,
      );
      samples.push(
        {
          market: "spread",
          slate,
          decisiveWin: decisive(spread.home),
          outcome: settleMargin(margin, spreadPrice.line),
        },
        {
          market: "spread",
          slate,
          decisiveWin: decisive(spread.away),
          outcome: settleMargin(-margin, -spreadPrice.line),
        },
      );
    }
  }
  for (const prediction of totals) {
    const distribution = distributionFor(totals, totalRows, prediction, false);
    if (!distribution) continue;
    const game = byId.get(totalRows[prediction.index]!.gameId)!;
    const totalPrice = game.prices?.total;
    if (!totalPrice) continue;
    const slate = slateOf(game.kickoff);
    const total = totalFromDistribution(
      anchoredMass(distribution, totalPrice.line, prediction.mean),
      totalPrice.line,
    );
    const over = settleTotal(game.homeScore + game.awayScore, totalPrice.line);
    samples.push(
      { market: "total", slate, decisiveWin: decisive(total.over), outcome: over },
      {
        market: "total",
        slate,
        decisiveWin: decisive(total.under),
        outcome: over === "win" ? "loss" : over === "loss" ? "win" : "push",
      },
    );
  }
  return samples;
}

export function fitArtifact(
  games: readonly PricedGame[],
  cutoff?: string,
  features: FeatureParameters = DEFAULT_FEATURES,
): ModelArtifact {
  const ordered = [...games].sort(
    (a, b) => kickoffMs(a) - kickoffMs(b) || a.id.localeCompare(b.id),
  );
  const trainingCutoff =
    cutoff ?? ordered[Math.max(0, Math.floor(ordered.length * 0.7) - 1)]?.kickoff;
  if (!trainingCutoff) throw new Error("No games to fit");
  const rows = buildFeatureRows(ordered, features);
  const byId = new Map(ordered.map((game) => [game.id, game]));
  const train = rows.filter(
    (row) => resultAvailableMs(row) < kickoffMs({ kickoff: trainingCutoff }),
  );
  if (train.length < 2) throw new Error("Training window needs at least two games");
  const closeMean = (
    game: PricedGame,
    market: Market,
    distribution: ResidualDistribution,
  ): number | null => {
    const prices = game.prices;
    if (market === "moneyline" && prices?.moneyline) {
      return anchorFromQuote(
        "moneyline",
        {
          sportsbook: "close",
          homeAmerican: prices.moneyline.home.american,
          awayAmerican: prices.moneyline.away.american,
        },
        distribution,
      ).mean;
    }
    if (market === "spread" && prices?.spread) return marginFromHomeLine(prices.spread.line);
    if (market === "total" && prices?.total) return prices.total.line;
    return null;
  };
  const flat: ResidualDistribution = fitResidualDistribution(
    train.map(() => 0),
    DEFAULT_FIT.residualBandwidth,
  );
  const anchored = (distribution: (row: FeatureRow) => ResidualDistribution) => {
    const marginRows: FeatureRow[] = [];
    const marginTargets: number[] = [];
    const totalRows: FeatureRow[] = [];
    const totalTargets: number[] = [];
    const excluded = { moneyline: 0, spread: 0, total: 0 };
    for (const row of train) {
      const game = byId.get(row.gameId)!;
      const marginAnchor =
        closeMean(game, "spread", flat) ?? closeMean(game, "moneyline", distribution(row));
      if (marginAnchor === null) excluded.moneyline += 1;
      else {
        marginRows.push(row);
        marginTargets.push(marginHome(game) - marginAnchor);
      }
      if (!game.prices?.spread) excluded.spread += 1;
      const totalAnchor = closeMean(game, "total", flat);
      if (totalAnchor === null) excluded.total += 1;
      else {
        totalRows.push(row);
        totalTargets.push(totalPoints(game) - totalAnchor);
      }
    }
    return { marginRows, marginTargets, totalRows, totalTargets, excluded };
  };
  const first = anchored(() => flat);
  if (first.marginRows.length < 2 || first.totalRows.length < 2) {
    throw new Error("Training window needs priced games for the anchor");
  }
  const distributions = new Map<number, ResidualDistribution>();
  const priorDistribution = (row: FeatureRow): ResidualDistribution => {
    const cutoff = kickoffMs(row);
    const cached = distributions.get(cutoff);
    if (cached) return cached;
    const prior = first.marginRows.flatMap((previous, index) =>
      resultAvailableMs(previous) < cutoff ? [first.marginTargets[index]!] : [],
    );
    const distribution = prior.length
      ? fitResidualDistribution(prior, DEFAULT_FIT.residualBandwidth)
      : flat;
    distributions.set(cutoff, distribution);
    return distribution;
  };
  const { marginRows, marginTargets, totalRows, totalTargets, excluded } =
    anchored(priorDistribution);
  // Targets are distances from the close. Ties, home wins, and key numbers are about the final
  // margin itself, so they are counted from it.
  const margins = marginRows.map((row) => marginHome(byId.get(row.gameId)!));
  const homeWins = margins.filter((margin) => margin > 0).length;
  const ties = margins.filter((margin) => margin === 0).length;
  const marginModel = fitRidge(marginRows, marginTargets, DEFAULT_FIT.ridge);
  const totalModel = fitRidge(totalRows, totalTargets, DEFAULT_FIT.ridge);
  const marginPredictions =
    marginRows.length >= MIN_WALK_FORWARD_GAMES
      ? walkForwardPredictions(
          marginRows,
          marginTargets,
          DEFAULT_FIT.ridge,
          DEFAULT_FIT.residualFolds,
        )
      : [];
  const totalPredictions =
    totalRows.length >= MIN_WALK_FORWARD_GAMES
      ? walkForwardPredictions(
          totalRows,
          totalTargets,
          DEFAULT_FIT.ridge,
          DEFAULT_FIT.residualFolds,
        )
      : [];
  // The market close is hard to improve on, so each adjustment is kept only as far as it predicted
  // the distance from the close on earlier blocks.
  const shrink = {
    margin: shrinkFactor(marginPredictions, marginTargets),
    total: shrinkFactor(totalPredictions, totalTargets),
  };
  const shrunkMargins = shrinkPredictions(marginPredictions, shrink.margin);
  const shrunkTotals = shrinkPredictions(totalPredictions, shrink.total);
  const walkForward = marginPredictions.length > 0;
  const inSample = (rows: FeatureRow[], targets: number[], model: typeof marginModel) =>
    rows.map((row, index) => (targets[index] ?? 0) - predictMean(model, row));
  const marginResiduals = walkForward
    ? shrunkMargins.map((entry) => entry.residual)
    : inSample(marginRows, marginTargets, marginModel);
  const totalResiduals =
    totalPredictions.length > 0
      ? shrunkTotals.map((entry) => entry.residual)
      : inSample(totalRows, totalTargets, totalModel);
  const calibrationPredictions = (
    rows: readonly FeatureRow[],
    targets: readonly number[],
    predictions: readonly WalkForwardPrediction[],
  ): WalkForwardPrediction[] => {
    const factors = new Map<number, number>();
    return predictions.map((prediction) => {
      let factor = factors.get(prediction.block);
      if (factor === undefined) {
        const first = predictions.find((entry) => entry.block === prediction.block)!;
        const cutoff = kickoffMs(rows[first.index]!);
        const earlier = predictions.filter(
          (entry) =>
            entry.block < prediction.block && resultAvailableMs(rows[entry.index]!) < cutoff,
        );
        factor = earlier.length > 0 ? shrinkFactor(earlier, targets) : 0;
        factors.set(prediction.block, factor);
      }
      const mean = prediction.mean * factor;
      return { ...prediction, mean, residual: targets[prediction.index]! - mean };
    });
  };
  const uncertainty = fitUncertainty(
    calibrationSamples(
      marginRows,
      totalRows,
      byId,
      calibrationPredictions(marginRows, marginTargets, marginPredictions),
      calibrationPredictions(totalRows, totalTargets, totalPredictions),
    ),
  );
  return withChecksum({
    kind: "pocketcheck-baseline",
    version: 6,
    trainingCode: TRAINING_CODE,
    releaseStatus: "unreleased",
    releasedMarkets: [],
    anchor: {
      definition:
        "moneyline no-vig home probability mapped to an implied margin; spread home line; total line",
      history: "recorded close",
      decisionTime: "one sportsbook's two sides",
      excludedNoClose: excluded,
    },
    datasetHash: datasetHash(
      ordered.map((game) => ({
        id: game.id,
        kickoff: game.kickoff,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
      })),
    ),
    trainingCutoff,
    chronology: CHRONOLOGY,
    featureDefinitions: FEATURE_DEFINITIONS,
    featureParameters: features,
    residualSource: walkForward ? "walk-forward" : "in-sample",
    fitParameters: DEFAULT_FIT,
    shrink,
    baseRates: {
      moneyline: {
        win: homeWins / margins.length,
        loss: (margins.length - homeWins - ties) / margins.length,
        push: ties / margins.length,
      },
    },
    uncertainty,
    margin: {
      model: scaleModel(marginModel, shrink.margin),
      // Totals have no comparable key numbers, so only margins are reweighted.
      residuals: fitResidualDistribution(
        marginResiduals,
        DEFAULT_FIT.residualBandwidth,
        undefined,
        keyNumberWeights(margins),
      ),
    },
    total: {
      model: scaleModel(totalModel, shrink.total),
      residuals: fitResidualDistribution(totalResiduals, DEFAULT_FIT.residualBandwidth),
    },
  });
}

/**
 * The least-squares multiplier on walk-forward predictions of the distance from the close, kept
 * between 0 (trust the close) and 1 (trust the full adjustment). Without walk-forward predictions
 * the adjustment is kept whole.
 */
export function shrinkFactor(
  predictions: readonly WalkForwardPrediction[],
  targets: readonly number[],
): number {
  if (predictions.length === 0) return 1;
  let cross = 0;
  let square = 0;
  for (const entry of predictions) {
    cross += entry.mean * (targets[entry.index] ?? 0);
    square += entry.mean * entry.mean;
  }
  if (square === 0) return 0;
  return Math.min(1, Math.max(0, cross / square));
}

function shrinkPredictions(
  predictions: readonly WalkForwardPrediction[],
  factor: number,
): WalkForwardPrediction[] {
  return predictions.map((entry) => ({
    ...entry,
    mean: entry.mean * factor,
    residual: entry.residual + entry.mean * (1 - factor),
  }));
}

function scaleModel(model: LinearModel, factor: number): LinearModel {
  return {
    ...model,
    intercept: model.intercept * factor,
    coefficients: Object.fromEntries(
      Object.entries(model.coefficients).map(([name, value]) => [name, value * factor]),
    ) as LinearModel["coefficients"],
  };
}

/** Reads a JSON fixture with a games array, or an nflverse games.csv. */
/**
 * Reads games from a fixture or the nflverse schedule. A schedule read joins the play-by-play
 * season files that sit beside it (play_by_play_<season>.csv) and keeps seasons from `since` on,
 * since earlier seasons have no plays to join. Seasons without a file stay without efficiency.
 */
/**
 * Priced games for fitting and for live forecasts alike. With play-by-play files beside a schedule
 * CSV, history starts at the first season they cover, so every game has the efficiency inputs the
 * model is fit on.
 */
export function readGames(path: string): PricedGame[] {
  const text = readFileSync(path, "utf8");
  if (path.endsWith(".csv")) {
    const directory = dirname(path);
    const files = readdirSync(directory)
      .map((name) => /^play_by_play_(\d{4})\.csv$/.exec(name))
      .filter((match) => match !== null)
      .map((match) => ({ season: Number(match[1]), path: join(directory, match[0]) }))
      .sort((a, b) => a.season - b.season);
    const games = pricedGamesFromNflverseCsv(text);
    if (files.length === 0) return games;
    const first = files[0]!.season;
    return attachEfficiency(
      games.filter((game) => (game.season ?? 0) >= first),
      teamSummariesFromSeasonFiles(files),
    );
  }
  const parsed = JSON.parse(text) as { games: PricedGame[] };
  if (!Array.isArray(parsed.games)) throw new Error("Fixture must contain a games array");
  return parsed.games;
}

export function assertUnreleased(artifact: ModelArtifact): void {
  if (artifact.releaseStatus !== "unreleased" || artifact.releasedMarkets.length > 0) {
    throw new Error("Fit must default to an unreleased artifact");
  }
}
