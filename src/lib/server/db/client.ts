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
    onnotice: () => {},
  });
}

export async function closeDb(db: Db): Promise<void> {
  await db.end({ timeout: 5 });
}
