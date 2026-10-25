import { writeFileSync } from "node:fs";
import postgres from "postgres";
import { redactSecrets } from "../../src/lib/server/analysis/redact.ts";
import { JournalRepository } from "../../src/lib/server/db/repository.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Export skipped.");
  process.exit(0);
}

const output = process.argv[2] ?? "journal-export.json";
const sql = postgres(databaseUrl, { max: 1 });
try {
  const journal = new JournalRepository(sql);
  const snapshot = redactSecrets(await journal.exportJournal());
  writeFileSync(output, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ output, analyses: snapshot.analyses.length }));
} finally {
  await sql.end();
}
