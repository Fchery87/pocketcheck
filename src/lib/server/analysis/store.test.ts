import { createMemoryStore } from "#lib/server/analysis/store.ts";
import { describeStoreContract } from "../../../../tests/store-contract.ts";

describeStoreContract("memory", createMemoryStore);
