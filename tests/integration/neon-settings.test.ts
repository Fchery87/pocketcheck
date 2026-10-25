import { afterAll, beforeAll, describe } from "vite-plus/test";
import { createNeonSettings } from "#lib/server/settings/neon-settings.ts";
import { describeSettingsContract } from "../settings-contract.ts";
import { isolatedDb, testDatabaseUrl, type IsolatedDb } from "./isolated-db.ts";

if (testDatabaseUrl) {
  // Each case needs an empty settings table, so each gets its own schema.
  const schemas: IsolatedDb[] = [];
  let next: IsolatedDb[] = [];
  beforeAll(async () => {
    next = await Promise.all([1, 2, 3, 4].map(() => isolatedDb()));
    schemas.push(...next);
  }, 120_000);
  afterAll(() => Promise.all(schemas.map((schema) => schema.drop())));
  describeSettingsContract("Neon", () => createNeonSettings(next.shift()!.db));
} else {
  describe.skip("Neon settings store (no database URL)", () => {});
}
