import { createMemorySettings } from "#lib/server/settings/store.ts";
import { describeSettingsContract } from "../../../../tests/settings-contract.ts";

describeSettingsContract("memory", createMemorySettings);
