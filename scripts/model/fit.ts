import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { readGames, fitArtifact, assertUnreleased } from "../../src/lib/server/models/train.ts";

const input = resolve(process.argv[2] ?? "tests/model/fixtures/synthetic-games.json");
const output = resolve(process.argv[3] ?? "data/artifacts/baseline.json");
const games = readGames(input);
const artifact = fitArtifact(games);
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
