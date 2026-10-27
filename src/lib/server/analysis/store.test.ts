import { createMemoryStore } from "#lib/server/analysis/store.ts";
import { describeGameBoardContract } from "../../../../tests/board-store-contract.ts";
import { describeStoreContract } from "../../../../tests/store-contract.ts";

describeStoreContract("memory", createMemoryStore);
describeGameBoardContract("memory", createMemoryStore);
import { describePickBetContract } from "../../../../tests/pick-bet-contract.ts";
import { describeModelPickPerformanceContract } from "../../../../tests/model-pick-performance-contract.ts";
describePickBetContract("memory", createMemoryStore);
describeModelPickPerformanceContract("memory", createMemoryStore);
