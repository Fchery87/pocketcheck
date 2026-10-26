import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import type { Db } from "../../src/lib/server/db/client.ts";

export const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required and must identify disposable test storage");
}

export type IsolatedDb = { db: Db; schema: string; drop(): Promise<void> };
export type IsolatedDbOptions = { throughMigration?: string };

const options = {
  ssl: new URL(testDatabaseUrl).searchParams.get("sslmode") === "disable" ? false : "require",
  onnotice: () => {},
  connect_timeout: 30,
} satisfies postgres.Options<Record<string, postgres.PostgresType>>;

/**
 * A fresh schema with every migration applied. One connection, so the session's search_path
 * holds; it goes to the unpooled endpoint because the pooler does not keep session state.
 */
export async function isolatedDb(optionsForTest: IsolatedDbOptions = {}): Promise<IsolatedDb> {
  if (!testDatabaseUrl) throw new Error("No database URL for integration tests");
  const schema = `it_${randomBytes(6).toString("hex")}`;
  const admin = postgres(testDatabaseUrl, { ...options, max: 1 });
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  const db = postgres(testDatabaseUrl.replace("-pooler.", "."), {
    ...options,
    max: 1,
    idle_timeout: 0,
  });
  try {
    await db.unsafe(`SET search_path TO ${schema}`);
    const migrations = path.resolve(process.cwd(), "migrations");
    const files = (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort();
    const end = optionsForTest.throughMigration
      ? files.indexOf(optionsForTest.throughMigration)
      : files.length - 1;
    if (end < 0) throw new Error(`Migration not found: ${optionsForTest.throughMigration}`);
    for (const file of files.slice(0, end + 1)) {
      await db.unsafe(await readFile(path.join(migrations, file), "utf8"));
    }
  } catch (error) {
    await db.end({ timeout: 5 });
    await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end({ timeout: 5 });
    throw error;
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
