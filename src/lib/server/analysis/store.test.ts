import { createMemoryStore } from "#lib/server/analysis/store.ts";
import { describeGameBoardContract } from "../../../../tests/board-store-contract.ts";
import { describeJournalBackupContract } from "../../../../tests/journal-backup-contract.ts";
import { describeModelPickPerformanceContract } from "../../../../tests/model-pick-performance-contract.ts";
import { describePickBetContract } from "../../../../tests/pick-bet-contract.ts";
import { describeStoreContract } from "../../../../tests/store-contract.ts";

describeStoreContract("memory", createMemoryStore);
describeGameBoardContract("memory", createMemoryStore);
describePickBetContract("memory", createMemoryStore);
describeModelPickPerformanceContract("memory", createMemoryStore);
describeJournalBackupContract("memory", createMemoryStore, {
  name: "memory",
  makeStore: createMemoryStore,
});
