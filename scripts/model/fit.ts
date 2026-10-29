import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DEFAULT_FEATURES } from "../../src/lib/server/models/features.ts";
import { readGames, fitArtifact, assertUnreleased } from "../../src/lib/server/models/train.ts";

// MODEL_SINCE_SEASON keeps schedule games from that season on, e.g. 2016 where play-by-play exists.
const sinceSeason = process.env.MODEL_SINCE_SEASON
  ? Number(process.env.MODEL_SINCE_SEASON)
  : undefined;

const input = resolve(process.argv[2] ?? "tests/model/fixtures/synthetic-games.json");
const output = resolve(process.argv[3] ?? "data/artifacts/baseline.json");
// Optional training cutoff (an ISO time). Without one, the earliest 70% of games train.
const cutoff = process.argv[4];
const games = readGames(input, { since: sinceSeason });
const artifact = fitArtifact(games, cutoff, {
  ...DEFAULT_FEATURES,
  excludedGroups: (process.env.MODEL_EXCLUDE_GROUPS ?? "").split(",").filter(Boolean),
});
assertUnreleased(artifact);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(
  JSON.stringify({
    output,
    datasetHash: artifact.datasetHash,
    trainingCutoff: artifact.trainingCutoff,
    checksum: artifact.checksum,
    releaseStatus: artifact.releaseStatus,
  }),
);
