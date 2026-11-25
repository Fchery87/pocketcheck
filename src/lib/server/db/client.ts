import postgres, { type Sql } from "postgres";

export type Db = Sql;

export function createDb(connectionString: string): Db {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  return postgres(connectionString, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 30,
    ssl: "require",
    // Neon's pooled endpoint runs PgBouncer in transaction mode, where named prepared
    // statements can fail with "prepared statement does not exist". Unnamed statements
    // work on both the pooled and the direct host.
    prepare: false,
    onnotice: () => {},
  });
}

export async function closeDb(db: Db): Promise<void> {
  await db.end({ timeout: 5 });
}
