import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArtifact } from "../../src/lib/server/models/inputs.ts";
import {
  scoreHoldout,
  summarize,
  type EvaluationReport,
} from "../../src/lib/server/models/evaluate.ts";
import { buildFeatureRows } from "../../src/lib/server/models/features.ts";
import { kickoffMs } from "../../src/lib/server/models/games.ts";
import { releaseDecision } from "../../src/lib/server/models/release.ts";
import { readGames } from "../../src/lib/server/models/train.ts";

const artifactPath = resolve(process.argv[2] ?? "data/artifacts/baseline.json");
const fixturePath = resolve(process.argv[3] ?? "tests/model/fixtures/synthetic-games.json");
const output = resolve(process.argv[4] ?? "data/artifacts/baseline-evaluation.json");
const artifactValue: unknown = JSON.parse(readFileSync(artifactPath, "utf8"));
const stored = parseArtifact(artifactValue);
const { checksum } = stored;
const games = readGames(fixturePath);
const rows = buildFeatureRows(games, stored.featureParameters).filter(
  (row) => kickoffMs(row) > kickoffMs({ kickoff: stored.trainingCutoff }),
);
const forecasts = scoreHoldout(stored, rows, games);
const summary = summarize(forecasts);
const release = releaseDecision(summary);
const report = {
  version: 1,
  artifactChecksum: checksum,
  datasetHash: stored.datasetHash,
  trainingCutoff: stored.trainingCutoff,
  holdoutGames: rows.length,
  missingPriceNote: "Games without a recorded price stay missing and are not graded as losses.",
  summary,
  release,
} satisfies EvaluationReport & {
  missingPriceNote: string;
  release: ReturnType<typeof releaseDecision>;
};
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify({
    output,
    brier: summary.brier,
    logLoss: summary.logLoss,
    coverage: summary.coverage,
    baselines: summary.baselines,
    release,
    threshold: summary.threshold,
  }),
);
