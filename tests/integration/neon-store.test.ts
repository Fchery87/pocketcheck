import { afterEach } from "vite-plus/test";
import { createNeonStore } from "#lib/server/analysis/neon-store.ts";
import { describeGameBoardContract } from "../board-store-contract.ts";
import { describeStoreContract } from "../store-contract.ts";
import { isolatedDb, type IsolatedDb } from "./isolated-db.ts";

const open: IsolatedDb[] = [];

async function makeStore() {
  const isolated = await isolatedDb();
  open.push(isolated);
  return createNeonStore(isolated.db);
}

describeStoreContract("Neon", makeStore);
describeGameBoardContract("Neon", makeStore);

afterEach(async () => {
  const pending = open.splice(0);
  await Promise.all(pending.map((item) => item.drop()));
});
