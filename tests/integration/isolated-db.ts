import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import type { Db } from "../../src/lib/server/db/client.ts";

function loadEnv(text: string) {
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
  loadEnv(await readFile(path.resolve(process.cwd(), ".env"), "utf8"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

/** TEST_DATABASE_URL when set, otherwise the dev database. Tests never touch its public schema. */
export const testDatabaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || null;

export type IsolatedDb = { db: Db; schema: string; drop(): Promise<void> };

const options = { ssl: "require" as const, onnotice: () => {}, connect_timeout: 30 };

/**
 * A fresh schema with every migration applied. One connection, so the session's search_path
 * holds; it goes to the unpooled endpoint because the pooler does not keep session state.
 */
export async function isolatedDb(): Promise<IsolatedDb> {
  if (!testDatabaseUrl) throw new Error("No database URL for integration tests");
  const schema = `it_${randomBytes(6).toString("hex")}`;
  const admin = postgres(testDatabaseUrl, { ...options, max: 1 });
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  const db = postgres(testDatabaseUrl.replace("-pooler.", "."), {
    ...options,
    max: 1,
    idle_timeout: 0,
  });
  await db.unsafe(`SET search_path TO ${schema}`);
  const migrations = path.resolve(process.cwd(), "migrations");
  for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
    await db.unsafe(await readFile(path.join(migrations, file), "utf8"));
  }
  return {
    db,
    schema,
    async drop() {
      await db.end({ timeout: 5 });
      await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end({ timeout: 5 });
    },
  };
}
