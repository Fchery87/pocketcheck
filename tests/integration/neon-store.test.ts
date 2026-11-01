import { afterEach } from "vite-plus/test";
import { createNeonStore } from "#lib/server/analysis/neon-store.ts";
import { createMemoryStore } from "#lib/server/analysis/store.ts";
import { describeGameBoardContract } from "../board-store-contract.ts";
import { describeJournalBackupContract } from "../journal-backup-contract.ts";
import { describeModelPickPerformanceContract } from "../model-pick-performance-contract.ts";
import { describePickBetContract } from "../pick-bet-contract.ts";
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
describePickBetContract("Neon", makeStore);
describeModelPickPerformanceContract("Neon", makeStore);
describeJournalBackupContract("Neon", makeStore, { name: "memory", makeStore: createMemoryStore });
describeJournalBackupContract("memory", createMemoryStore, { name: "Neon", makeStore });

afterEach(async () => {
  const pending = open.splice(0);
  await Promise.all(pending.map((item) => item.drop()));
});
