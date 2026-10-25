import { readFileSync } from "node:fs";
import { datasetHash, valueEligibility, withChecksum, type ModelArtifact } from "./artifact.ts";
import { fitResidualDistribution } from "./distribution.ts";
import { buildFeatureRows } from "./features.ts";
import { FEATURE_DEFINITIONS } from "./features.ts";
import { DEFAULT_FIT, fitRidge, predictMean } from "./fit.ts";
import { kickoffMs, marginHome, totalPoints, type PricedGame } from "./games.ts";

export function fitArtifact(games: readonly PricedGame[], cutoff?: string): ModelArtifact {
  const ordered = [...games].sort((a, b) => kickoffMs(a) - kickoffMs(b));
  const trainingCutoff = cutoff ?? ordered[Math.max(0, Math.floor(ordered.length * 0.7) - 1)]?.kickoff;
  if (!trainingCutoff) throw new Error("No games to fit");
  const rows = buildFeatureRows(ordered);
  const byId = new Map(ordered.map((game) => [game.id, game]));
  const train = rows.filter((row) => kickoffMs({ kickoff: row.kickoff }) <= kickoffMs({ kickoff: trainingCutoff }));
  if (train.length < 2) throw new Error("Training window needs at least two games");
  const marginTargets = train.map((row) => marginHome(byId.get(row.gameId)!));
  const totalTargets = train.map((row) => totalPoints(byId.get(row.gameId)!));
  const marginModel = fitRidge(train, marginTargets, DEFAULT_FIT.ridge);
  const totalModel = fitRidge(train, totalTargets, DEFAULT_FIT.ridge);
  const marginResiduals = train.map((row, index) => (marginTargets[index] ?? 0) - predictMean(marginModel, row));
  const totalResiduals = train.map((row, index) => (totalTargets[index] ?? 0) - predictMean(totalModel, row));
  return withChecksum({
    kind: "pocketcheck-baseline",
    version: 1,
    releaseStatus: "unreleased",
    datasetHash: datasetHash(ordered.map((game) => ({ id: game.id, kickoff: game.kickoff, homeScore: game.homeScore, awayScore: game.awayScore }))),
    trainingCutoff,
    featureDefinitions: FEATURE_DEFINITIONS,
    fitParameters: DEFAULT_FIT,
    margin: {
      model: marginModel,
      residuals: fitResidualDistribution(marginResiduals, DEFAULT_FIT.residualBandwidth),
    },
    total: {
      model: totalModel,
      residuals: fitResidualDistribution(totalResiduals, DEFAULT_FIT.residualBandwidth),
    },
  });
}

export function readGames(path: string): PricedGame[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { games: PricedGame[] };
  if (!Array.isArray(parsed.games)) throw new Error("Fixture must contain a games array");
  return parsed.games;
}

export function assertUnreleased(artifact: ModelArtifact): void {
  const eligibility = valueEligibility(artifact);
  if (eligibility.eligible) {
    throw new Error("Fit must default to an unreleased artifact");
  }
}
