import { randomBytes } from "node:crypto";
import { link, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { encodeJournalBackup } from "../../src/lib/server/analysis/journal-backup.ts";
import { createNeonStore } from "../../src/lib/server/analysis/neon-store.ts";
import type { JournalStore } from "../../src/lib/server/analysis/store.ts";
import { closeDb, createDb } from "../../src/lib/server/db/client.ts";

/**
 * Write the complete version 1 backup to a new file. The graph is validated before any byte is
 * written, and an existing file at `output` is never replaced, so an earlier backup survives.
 */
export async function writeJournalBackup(
  journal: Pick<JournalStore, "exportJournal">,
  output: string,
): Promise<void> {
  const bytes = encodeJournalBackup(await journal.exportJournal());
  const partial = `${output}.${randomBytes(6).toString("hex")}.partial`;
  await writeFile(partial, bytes, { flag: "wx" });
  try {
    await link(partial, output);
  } finally {
    await unlink(partial);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. No backup was written.");
    process.exit(1);
  }
  const output = process.argv[2] ?? "journal-export.json";
  const db = createDb(databaseUrl);
  try {
    await writeJournalBackup(createNeonStore(db), output);
    console.log(JSON.stringify({ output }));
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : cause);
    process.exitCode = 1;
  } finally {
    await closeDb(db);
  }
}
