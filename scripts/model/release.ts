import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { artifactChecksum, type ModelArtifact } from "../../src/lib/server/models/artifact.ts";
import type { EvaluationReport } from "../../src/lib/server/models/evaluate.ts";
import { releaseArtifact } from "../../src/lib/server/models/release.ts";

// Releases the markets where an evaluated artifact is no worse than the no-vig closing price.
// The released artifact is written to a new file. The input artifact is left unchanged.

const artifactPath = resolve(process.argv[2] ?? "data/artifacts/baseline.json");
const evaluationPath = resolve(process.argv[3] ?? "data/artifacts/baseline-evaluation.json");
const output = resolve(process.argv[4] ?? "data/artifacts/baseline-released.json");
const stored = JSON.parse(readFileSync(artifactPath, "utf8")) as ModelArtifact;
const { checksum, ...body } = stored;
if (artifactChecksum(body) !== checksum) {
  throw new Error("Artifact checksum does not match its contents");
}
const report = JSON.parse(readFileSync(evaluationPath, "utf8")) as EvaluationReport;
try {
  const released = releaseArtifact(stored, report);
  writeFileSync(output, `${JSON.stringify(released, null, 2)}\n`);
  console.log(
    JSON.stringify({
      output,
      releasedMarkets: released.releasedMarkets,
      checksum: released.checksum,
    }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
