import { afterAll, beforeAll, describe } from "vite-plus/test";
import { createNeonStore } from "#lib/server/analysis/neon-store.ts";
import { describeStoreContract } from "../store-contract.ts";
import { isolatedDb, testDatabaseUrl, type IsolatedDb } from "./isolated-db.ts";

if (testDatabaseUrl) {
  let isolated: IsolatedDb;
  beforeAll(async () => {
    isolated = await isolatedDb();
  }, 60_000);
  afterAll(() => isolated?.drop());
  describeStoreContract("Neon", () => createNeonStore(isolated.db));
} else {
  describe.skip("Neon research store (no database URL)", () => {});
}
