import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(text) {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

try {
  loadEnvFile(await readFile(path.join(root, ".env"), "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Set it in the environment or .env.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  ssl: "require",
  onnotice: () => {},
});

try {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  const files = (await readdir(path.join(root, "migrations")))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const applied = await sql`SELECT filename FROM schema_migrations`;
  const seen = new Set(applied.map((row) => row.filename));
  let count = 0;
  for (const filename of files) {
    if (seen.has(filename)) continue;
    const body = await readFile(path.join(root, "migrations", filename), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (filename) VALUES (${filename})`;
    });
    count += 1;
    console.log(`applied ${filename}`);
  }
  console.log(count === 0 ? "no pending migrations" : `applied ${count} migration(s)`);
} finally {
  await sql.end({ timeout: 5 });
}
