import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { teamSummariesFromSeasonFiles } from "../sources/play-by-play.ts";
import { attachEfficiency } from "./efficiency-join.ts";
import { datasetHash, withChecksum, type ModelArtifact } from "./artifact.ts";
import {
  fitResidualDistribution,
  integerMass,
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
  train: readonly FeatureRow[],
  byId: ReadonlyMap<string, PricedGame>,
  margins: readonly WalkForwardPrediction[],
  totals: readonly WalkForwardPrediction[],
  finalMargins: readonly number[],
): CalibrationSample[] {
  const samples: CalibrationSample[] = [];
  const distributions = new Map<
    number,
    { margin: ResidualDistribution; total: ResidualDistribution }
  >();
  margins.forEach((marginPrediction, position) => {
    const totalPrediction = totals[position]!;
    if (marginPrediction.block < 2) return;
    let pair = distributions.get(marginPrediction.block);
    if (!pair) {
      const blockStart = margins.find((entry) => entry.block === marginPrediction.block)!.index;
      const cutoff = kickoffMs(train[blockStart]!);
      const earlier = (list: readonly WalkForwardPrediction[]) =>
        list
          .filter(
            (entry) =>
              entry.block < marginPrediction.block &&
              resultAvailableMs(train[entry.index]!) < cutoff,
          )
          .map((entry) => entry.residual);
      const marginResiduals = earlier(margins);
      const totalResiduals = earlier(totals);
      if (marginResiduals.length === 0 || totalResiduals.length === 0) return;
      pair = {
        margin: fitResidualDistribution(
          marginResiduals,
          DEFAULT_FIT.residualBandwidth,
          undefined,
          keyNumberWeights(
            finalMargins
              .slice(0, blockStart)
              .filter((_, index) => resultAvailableMs(train[index]!) < cutoff),
          ),
        ),
        total: fitResidualDistribution(totalResiduals, DEFAULT_FIT.residualBandwidth),
      };
      distributions.set(marginPrediction.block, pair);
    }
    const row = train[marginPrediction.index]!;
    const game = byId.get(row.gameId)!;
    const slate = slateOf(game.kickoff);
    const marginBins = integerMass(pair.margin, marginPrediction.mean);
    const margin = game.homeScore - game.awayScore;
    const moneyline = moneylineFromMargin(marginBins);
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
    const spreadPrice = game.prices?.spread;
    if (spreadPrice) {
      const spread = spreadFromMargin(marginBins, spreadPrice.line);
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
    const totalPrice = game.prices?.total;
    if (totalPrice) {
      const total = totalFromDistribution(
        integerMass(pair.total, totalPrediction.mean),
        totalPrice.line,
      );
      const points = game.homeScore + game.awayScore;
      const over = settleTotal(points, totalPrice.line);
      samples.push(
        {
          market: "total",
          slate,
          decisiveWin: decisive(total.over),
          outcome: over,
        },
        {
          market: "total",
          slate,
          decisiveWin: decisive(total.under),
          outcome: over === "win" ? "loss" : over === "loss" ? "win" : "push",
        },
      );
    }
  });
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
  // Residuals need a distribution before the moneyline anchor exists, so the first pass uses a
  // flat one and the second pass uses the fitted margin distribution.
  const flat: ResidualDistribution = fitResidualDistribution(
    train.map(() => 0),
    DEFAULT_FIT.residualBandwidth,
  );
  const anchored = (distribution: ResidualDistribution) => {
    const marginRows: FeatureRow[] = [];
    const marginTargets: number[] = [];
    const totalRows: FeatureRow[] = [];
    const totalTargets: number[] = [];
    const excluded = { moneyline: 0, spread: 0, total: 0 };
    for (const row of train) {
      const game = byId.get(row.gameId)!;
      const marginAnchor =
        closeMean(game, "spread", distribution) ?? closeMean(game, "moneyline", distribution);
      if (marginAnchor === null) excluded.moneyline += 1;
      else {
        marginRows.push(row);
        marginTargets.push(marginHome(game) - marginAnchor);
      }
      if (!game.prices?.spread) excluded.spread += 1;
      const totalAnchor = closeMean(game, "total", distribution);
      if (totalAnchor === null) excluded.total += 1;
      else {
        totalRows.push(row);
        totalTargets.push(totalPoints(game) - totalAnchor);
      }
    }
    return { marginRows, marginTargets, totalRows, totalTargets, excluded };
  };
  const first = anchored(flat);
  if (first.marginRows.length < 2 || first.totalRows.length < 2) {
    throw new Error("Training window needs priced games for the anchor");
  }
  const preliminary = fitResidualDistribution(first.marginTargets, DEFAULT_FIT.residualBandwidth);
  const { marginRows, marginTargets, totalRows, totalTargets, excluded } = anchored(preliminary);
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
  const walkForward = marginPredictions.length > 0;
  const inSample = (rows: FeatureRow[], targets: number[], model: typeof marginModel) =>
    rows.map((row, index) => (targets[index] ?? 0) - predictMean(model, row));
  const marginResiduals = walkForward
    ? marginPredictions.map((entry) => entry.residual)
    : inSample(marginRows, marginTargets, marginModel);
  const totalResiduals = walkForward
    ? totalPredictions.map((entry) => entry.residual)
    : inSample(totalRows, totalTargets, totalModel);
  const uncertainty = fitUncertainty(
    calibrationSamples(train, byId, marginPredictions, totalPredictions, margins),
  );
  return withChecksum({
    kind: "pocketcheck-baseline",
    version: 6,
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
    baseRates: {
      moneyline: {
        win: homeWins / margins.length,
        loss: (margins.length - homeWins - ties) / margins.length,
        push: ties / margins.length,
      },
    },
    uncertainty,
    margin: {
      model: marginModel,
      // Totals have no comparable key numbers, so only margins are reweighted.
      residuals: fitResidualDistribution(
        marginResiduals,
        DEFAULT_FIT.residualBandwidth,
        undefined,
        keyNumberWeights(margins),
      ),
    },
    total: {
      model: totalModel,
      residuals: fitResidualDistribution(totalResiduals, DEFAULT_FIT.residualBandwidth),
    },
  });
}

/** Reads a JSON fixture with a games array, or an nflverse games.csv. */
/**
 * Reads games from a fixture or the nflverse schedule. A schedule read joins the play-by-play
 * season files that sit beside it (play_by_play_<season>.csv) and keeps seasons from `since` on,
 * since earlier seasons have no plays to join. Seasons without a file stay without efficiency.
 */
export function readGames(path: string, options: { since?: number } = {}): PricedGame[] {
  const text = readFileSync(path, "utf8");
  if (path.endsWith(".csv")) {
    const games = pricedGamesFromNflverseCsv(text).filter(
      (game) => options.since === undefined || (game.season ?? 0) >= options.since,
    );
    const seasons = [...new Set(games.map((game) => game.season ?? 0))];
    const files = seasons
      .map((season) => ({ season, path: join(dirname(path), `play_by_play_${season}.csv`) }))
      .filter((file) => existsSync(file.path));
    return files.length === 0
      ? games
      : attachEfficiency(games, teamSummariesFromSeasonFiles(files));
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
