import { readFileSync } from "node:fs";
import { datasetHash, withChecksum, type ModelArtifact } from "./artifact.ts";
import { fitResidualDistribution, keyNumberWeights } from "./distribution.ts";
import {
  buildFeatureRows,
  DEFAULT_FEATURES,
  FEATURE_DEFINITIONS,
  type FeatureParameters,
} from "./features.ts";
import { DEFAULT_FIT, fitRidge, predictMean, walkForwardResiduals } from "./fit.ts";
import { kickoffMs, marginHome, totalPoints, type PricedGame } from "./games.ts";
import { pricedGamesFromNflverseCsv } from "./history.ts";

/** Below this, walk-forward blocks are too small to fit, so residuals fall back to in-sample. */
const MIN_WALK_FORWARD_GAMES = 40;

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
  const residuals = (targets: number[], model: typeof marginModel) =>
    walkForward
      ? walkForwardResiduals(train, targets, DEFAULT_FIT.ridge, DEFAULT_FIT.residualFolds)
      : train.map((row, index) => (targets[index] ?? 0) - predictMean(model, row));
  const marginResiduals = residuals(marginTargets, marginModel);
  const totalResiduals = residuals(totalTargets, totalModel);
  return withChecksum({
    kind: "pocketcheck-baseline",
    version: 3,
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
