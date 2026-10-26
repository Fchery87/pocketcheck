import { readFileSync } from "node:fs";
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
import { kickoffMs, marginHome, totalPoints, type PricedGame } from "./games.ts";
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
  marginTargets: readonly number[],
): CalibrationSample[] {
  const samples: CalibrationSample[] = [];
  const distributions = new Map<number, { margin: ResidualDistribution; total: ResidualDistribution }>();
  margins.forEach((marginPrediction, position) => {
    const totalPrediction = totals[position]!;
    if (marginPrediction.block < 2) return;
    let pair = distributions.get(marginPrediction.block);
    if (!pair) {
      const earlier = (list: readonly WalkForwardPrediction[]) =>
        list.filter((entry) => entry.block < marginPrediction.block).map((entry) => entry.residual);
      const blockStart = marginPrediction.index;
      pair = {
        margin: fitResidualDistribution(
          earlier(margins),
          DEFAULT_FIT.residualBandwidth,
          undefined,
          keyNumberWeights(marginTargets.slice(0, blockStart)),
        ),
        total: fitResidualDistribution(earlier(totals), DEFAULT_FIT.residualBandwidth),
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
      { market: "moneyline", slate, decisiveWin: decisive(moneyline.home), outcome: settleMargin(margin) },
      { market: "moneyline", slate, decisiveWin: decisive(moneyline.away), outcome: settleMargin(-margin) },
    );
    const spreadPrice = game.prices?.spread;
    if (spreadPrice) {
      const spread = spreadFromMargin(marginBins, spreadPrice.line);
      samples.push(
        { market: "spread", slate, decisiveWin: decisive(spread.home), outcome: settleMargin(margin, spreadPrice.line) },
        { market: "spread", slate, decisiveWin: decisive(spread.away), outcome: settleMargin(-margin, -spreadPrice.line) },
      );
    }
    const totalPrice = game.prices?.total;
    if (totalPrice) {
      const total = totalFromDistribution(integerMass(pair.total, totalPrediction.mean), totalPrice.line);
      const points = game.homeScore + game.awayScore;
      const over = settleTotal(points, totalPrice.line);
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
  });
  return samples;
}

export function fitArtifact(
  games: readonly PricedGame[],
  cutoff?: string,
  features: FeatureParameters = DEFAULT_FEATURES,
): ModelArtifact {
  const ordered = [...games].sort((a, b) => kickoffMs(a) - kickoffMs(b));
  const trainingCutoff =
    cutoff ?? ordered[Math.max(0, Math.floor(ordered.length * 0.7) - 1)]?.kickoff;
  if (!trainingCutoff) throw new Error("No games to fit");
  const rows = buildFeatureRows(ordered, features);
  const byId = new Map(ordered.map((game) => [game.id, game]));
  const train = rows.filter(
    (row) => kickoffMs({ kickoff: row.kickoff }) <= kickoffMs({ kickoff: trainingCutoff }),
  );
  if (train.length < 2) throw new Error("Training window needs at least two games");
  const marginTargets = train.map((row) => marginHome(byId.get(row.gameId)!));
  const totalTargets = train.map((row) => totalPoints(byId.get(row.gameId)!));
  const homeWins = marginTargets.filter((margin) => margin > 0).length;
  const ties = marginTargets.filter((margin) => margin === 0).length;
  const marginModel = fitRidge(train, marginTargets, DEFAULT_FIT.ridge);
  const totalModel = fitRidge(train, totalTargets, DEFAULT_FIT.ridge);
  const walkForward = train.length >= MIN_WALK_FORWARD_GAMES;
  const marginPredictions = walkForward
    ? walkForwardPredictions(train, marginTargets, DEFAULT_FIT.ridge, DEFAULT_FIT.residualFolds)
    : [];
  const totalPredictions = walkForward
    ? walkForwardPredictions(train, totalTargets, DEFAULT_FIT.ridge, DEFAULT_FIT.residualFolds)
    : [];
  const inSample = (targets: number[], model: typeof marginModel) =>
    train.map((row, index) => (targets[index] ?? 0) - predictMean(model, row));
  const marginResiduals = walkForward
    ? marginPredictions.map((entry) => entry.residual)
    : inSample(marginTargets, marginModel);
  const totalResiduals = walkForward
    ? totalPredictions.map((entry) => entry.residual)
    : inSample(totalTargets, totalModel);
  const uncertainty = fitUncertainty(
    calibrationSamples(train, byId, marginPredictions, totalPredictions, marginTargets),
  );
  return withChecksum({
    kind: "pocketcheck-baseline",
    version: 4,
    releaseStatus: "unreleased",
    releasedMarkets: [],
    datasetHash: datasetHash(
      ordered.map((game) => ({
        id: game.id,
        kickoff: game.kickoff,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
      })),
    ),
    trainingCutoff,
    featureDefinitions: FEATURE_DEFINITIONS,
    featureParameters: features,
    residualSource: walkForward ? "walk-forward" : "in-sample",
    fitParameters: DEFAULT_FIT,
    baseRates: {
      moneyline: {
        win: homeWins / train.length,
        loss: (train.length - homeWins - ties) / train.length,
        push: ties / train.length,
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
        keyNumberWeights(marginTargets),
      ),
    },
    total: {
      model: totalModel,
      residuals: fitResidualDistribution(totalResiduals, DEFAULT_FIT.residualBandwidth),
    },
  });
}

/** Reads a JSON fixture with a games array, or an nflverse games.csv. */
export function readGames(path: string): PricedGame[] {
  const text = readFileSync(path, "utf8");
  if (path.endsWith(".csv")) return pricedGamesFromNflverseCsv(text);
  const parsed = JSON.parse(text) as { games: PricedGame[] };
  if (!Array.isArray(parsed.games)) throw new Error("Fixture must contain a games array");
  return parsed.games;
}

export function assertUnreleased(artifact: ModelArtifact): void {
  if (artifact.releaseStatus !== "unreleased" || artifact.releasedMarkets.length > 0) {
    throw new Error("Fit must default to an unreleased artifact");
  }
}
