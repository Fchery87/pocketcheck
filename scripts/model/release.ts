import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArtifact, parseEvaluationReport } from "../../src/lib/server/models/inputs.ts";
import { releaseFromJournal } from "../../src/lib/server/models/release.ts";
import { assertNewOutput, readProspectiveSources, writeNewOutput } from "./prospective.ts";

try {
  const args = process.argv.slice(2);
  const artifactPath = resolve(args[0] ?? "data/artifacts/baseline.json");
  const artifact = parseArtifact(JSON.parse(readFileSync(artifactPath, "utf8")) as unknown);
  if (args.length < 4) {
    const evaluationPath = resolve(args[1] ?? "data/artifacts/baseline-evaluation.json");
    parseEvaluationReport({
      value: JSON.parse(readFileSync(evaluationPath, "utf8")) as unknown,
      artifact,
    });
    throw new Error(
      "No market passed the release gate. Independent prospective evidence is missing or failed. A registered journal and protocol are required.",
    );
  }
  if (args.length !== 4)
    throw new Error(
      "Usage: model:release <artifact> <journal-v1.json> <protocol.json> <new-artifact>",
    );
  const journalPath = args[1]!;
  const protocolPath = args[2]!;
  const output = resolve(args[3]!);
  assertNewOutput(output, [artifactPath, journalPath, protocolPath]);
  const { journal, sample } = readProspectiveSources(journalPath, protocolPath);
  const released = releaseFromJournal({
    artifact,
    journal,
    registrationId: sample.protocol.id,
  });
  writeNewOutput(output, released, [artifactPath, journalPath, protocolPath]);
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
