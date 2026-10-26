import { afterAll, beforeAll } from "vite-plus/test";
import { createNeonStore } from "#lib/server/analysis/neon-store.ts";
import { describeStoreContract } from "../store-contract.ts";
import { isolatedDb, type IsolatedDb } from "./isolated-db.ts";

let isolated: IsolatedDb;
beforeAll(async () => {
  isolated = await isolatedDb();
}, 60_000);
afterAll(() => isolated?.drop());
describeStoreContract("Neon", () => createNeonStore(isolated.db));
