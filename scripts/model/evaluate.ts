import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArtifact } from "../../src/lib/server/models/inputs.ts";
import {
  ablateGroup,
  compareArtifacts,
  scoreHoldout,
  summarize,
  type AblationGroup,
  type ArtifactComparison,
  type EvaluationReport,
} from "../../src/lib/server/models/evaluate.ts";
import { buildFeatureRows, INPUT_GROUPS } from "../../src/lib/server/models/features.ts";
import { kickoffMs } from "../../src/lib/server/models/games.ts";
import { releaseDecision } from "../../src/lib/server/models/release.ts";
import { predictWithoutGroup } from "../../src/lib/server/models/predict.ts";
import { readGames } from "../../src/lib/server/models/train.ts";

const artifactPath = resolve(process.argv[2] ?? "data/artifacts/baseline.json");
const fixturePath = resolve(process.argv[3] ?? "tests/model/fixtures/synthetic-games.json");
const output = resolve(process.argv[4] ?? "data/artifacts/baseline-evaluation.json");
const previousPath = process.argv[5] ? resolve(process.argv[5]) : undefined;
const previousGamesPath = process.argv[6] ? resolve(process.argv[6]) : undefined;

try {
  if (previousPath !== undefined && !existsSync(previousPath)) {
    throw new Error(`Previous artifact not found: ${previousPath}`);
  }
  const stored = parseArtifact(JSON.parse(readFileSync(artifactPath, "utf8")) as unknown);
  const games = readGames(fixturePath);
  const rows = buildFeatureRows(games, stored.featureParameters).filter(
    (row) => kickoffMs(row) > kickoffMs({ kickoff: stored.trainingCutoff }),
  );
  const forecasts = scoreHoldout(stored, rows, games);
  const summary = summarize(forecasts);
  const ablation: AblationGroup[] = INPUT_GROUPS.map((group) =>
    ablateGroup({
      group: group.group,
      features: group.features,
      withGroup: forecasts,
      withoutGroup: scoreHoldout(stored, rows, games, (artifact, row, anchor) =>
        predictWithoutGroup(artifact, row, group.features, anchor),
      ),
    }),
  );
  const comparison = previousArtifact();
  const report = {
    version: 1,
    artifactChecksum: stored.checksum,
    datasetHash: stored.datasetHash,
    trainingCutoff: stored.trainingCutoff,
    holdoutGames: rows.length,
    evidence: "development",
    missingPriceNote: "Games without a recorded price stay missing and are not graded as losses.",
    summary,
    comparison,
    ablation,
    release: releaseDecision(summary),
  } satisfies EvaluationReport & {
    evidence: "development";
    missingPriceNote: string;
    comparison: ArtifactComparison | null;
    ablation: AblationGroup[];
    release: ReturnType<typeof releaseDecision>;
  };
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify({
      output,
      evidence: report.evidence,
      brier: summary.brier,
      logLoss: summary.logLoss,
      ablation: ablation.map((group) => group.group),
      comparedWith: comparison?.previousChecksum ?? null,
      release: report.release,
    }),
  );

  function previousArtifact(): ArtifactComparison | null {
    if (previousPath === undefined) return null;
    const previous = parseArtifact(JSON.parse(readFileSync(previousPath, "utf8")) as unknown);
    const previousGames = readGames(previousGamesPath ?? fixturePath);
    const previousRows = buildFeatureRows(previousGames, previous.featureParameters).filter(
      (row) => kickoffMs(row) > kickoffMs({ kickoff: stored.trainingCutoff }),
    );
    return compareArtifacts(
      forecasts,
      scoreHoldout(previous, previousRows, previousGames),
      previous.checksum,
    );
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
