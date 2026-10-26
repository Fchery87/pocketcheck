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

const options = {
  ssl: new URL(testDatabaseUrl).searchParams.get("sslmode") === "disable" ? false : "require",
  onnotice: () => {},
  connect_timeout: 30,
} satisfies postgres.Options<Record<string, postgres.PostgresType>>;

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
  try {
    await db.unsafe(`SET search_path TO ${schema}`);
    const migrations = path.resolve(process.cwd(), "migrations");
    for (const file of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
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
