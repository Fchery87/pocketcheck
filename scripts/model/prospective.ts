import { linkSync, lstatSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { buildProspectiveSample } from "../../src/lib/server/analysis/prospective-sample.ts";
import { evaluateProspectiveForecasts } from "../../src/lib/server/models/prospective.ts";
import { parseProtocolRegistration } from "../../src/lib/server/models/protocol.ts";
import type { JournalExport } from "../../src/lib/server/db/repository.ts";

export function readProspectiveSources(journalPath: string, protocolPath: string) {
  const journalBytes = readFileSync(journalPath, "utf8");
  const protocolBytes = readFileSync(protocolPath, "utf8");
  const journal: unknown = JSON.parse(journalBytes);
  const reference: unknown = JSON.parse(protocolBytes);
  const registration = parseProtocolRegistration(reference);
  if (!journal || typeof journal !== "object" || !("version" in journal) || journal.version !== 1)
    throw new Error("A version 1 journal export is required.");
  // The sample constructor validates the complete journal before using its records.
  const backup = journal as JournalExport;
  const sample = buildProspectiveSample({
    journal: backup,
    registrationId: registration.id,
  });
  if (!isDeepStrictEqual(reference, sample.protocol))
    throw new Error("The protocol file must exactly match the exported journal registration.");
  const identity = (path: string, bytes: string) => ({
    path: resolve(path),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  return {
    journal: backup,
    sample,
    sources: {
      journal: identity(journalPath, journalBytes),
      protocol: identity(protocolPath, protocolBytes),
    },
  };
}

export function writeNewOutput(outputPath: string, value: unknown, inputs: string[]) {
  assertNewOutput(outputPath, inputs);
  const output = resolve(outputPath);
  const temporary = join(dirname(output), `.pocketcheck-model-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2), { flag: "wx" });
    linkSync(temporary, output);
  } finally {
    try {
      unlinkSync(temporary);
    } catch {
      /* Creation may have failed. */
    }
  }
}

export function assertNewOutput(outputPath: string, inputs: string[]) {
  const output = resolve(outputPath);
  if (inputs.some((input) => resolve(input) === output))
    throw new Error("Output must be a new file, not an input.");
  try {
    lstatSync(output);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  throw new Error("Output must be a new file.");
}

function main() {
  const [journalPath, protocolPath, outputPath, ...extra] = process.argv.slice(2);
  if (!journalPath || !protocolPath || !outputPath || extra.length)
    throw new Error("Usage: model:prospective <journal-v1.json> <protocol.json> <new-report>");
  assertNewOutput(outputPath, [journalPath, protocolPath]);
  const { journal, sample, sources } = readProspectiveSources(journalPath, protocolPath);
  const evaluation = evaluateProspectiveForecasts(sample.protocol.protocol, sample.records);
  writeNewOutput(
    outputPath,
    {
      version: 1,
      registrationId: sample.protocol.id,
      protocol: sample.protocol,
      artifactChecksum: sample.protocol.protocol.artifactChecksum,
      sources,
      sourceIdentities: {
        boards: (journal.gameBoards ?? []).map((board) => ({
          boardId: board.id,
          gameId: board.game.id,
          picks: board.markets.flatMap((market) => (market.pick ? [market.pick.id] : [])),
        })),
        settlements: (journal.gameSettlementNotices ?? []).map((notice) => notice.id),
        closingMarketSnapshots: (journal.closingMarketSnapshots ?? []).map((close) => close.id),
      },
      denominators: {
        qualified: sample.records.length,
        excluded: sample.excluded.length,
        markets: Object.fromEntries(
          Object.entries(evaluation.markets).map(([market, result]) => [
            market,
            {
              pricedGames: result.pricedGames,
              missingObservations: result.missingObservations,
              unresolved: result.unresolved,
            },
          ]),
        ),
      },
      excluded: sample.excluded,
      records: sample.records,
      evaluation,
    },
    [journalPath, protocolPath],
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
