import { createMemoryStore } from "#lib/server/analysis/store.ts";
import { describeGameBoardContract } from "../../../../tests/board-store-contract.ts";
import { describeStoreContract } from "../../../../tests/store-contract.ts";

describeStoreContract("memory", createMemoryStore);
describeGameBoardContract("memory", createMemoryStore);
