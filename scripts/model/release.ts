import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArtifact, parseEvaluationReport } from "../../src/lib/server/models/inputs.ts";
import { releaseArtifact } from "../../src/lib/server/models/release.ts";

// Releases the markets where an evaluated artifact is no worse than the no-vig closing price.
// The released artifact is written to a new file. The input artifact is left unchanged.

const artifactPath = resolve(process.argv[2] ?? "data/artifacts/baseline.json");
const evaluationPath = resolve(process.argv[3] ?? "data/artifacts/baseline-evaluation.json");
const output = resolve(process.argv[4] ?? "data/artifacts/baseline-released.json");
try {
  const artifactValue: unknown = JSON.parse(readFileSync(artifactPath, "utf8"));
  const stored = parseArtifact(artifactValue);
  const reportValue: unknown = JSON.parse(readFileSync(evaluationPath, "utf8"));
  const report = parseEvaluationReport({ value: reportValue, artifact: stored });
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
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
