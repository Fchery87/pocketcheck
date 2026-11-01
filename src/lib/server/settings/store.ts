import { redactText } from "../analysis/redact.ts";
import type { ModelCatalog, ModelTest, ProviderId } from "../providers/contracts.ts";

/**
 * Non-secret settings: which drafter writes theses, each provider's cached model catalog, and
 * capability test results. API keys never pass through here; they stay in server env.
 */

export type DrafterChoice = { provider: "fixture" } | { provider: ProviderId; modelId: string };

export type SettingsStore = {
  getDrafter: () => Promise<DrafterChoice>;
  setDrafter: (choice: DrafterChoice) => Promise<void>;
  getCatalog: (provider: ProviderId) => Promise<ModelCatalog | null>;
  saveCatalog: (catalog: ModelCatalog) => Promise<void>;
  getModelTests: (provider: ProviderId) => Promise<Record<string, ModelTest>>;
  saveModelTest: (provider: ProviderId, modelId: string, test: ModelTest) => Promise<void>;
};

export type SettingsOptions = {
  /** Configured credentials, removed from a test failure before it is saved and when it is read. */
  secrets: readonly string[];
};

/** A failure reason can quote a credential, and rows saved before redaction may still hold one. */
export function redactModelTest(test: ModelTest, secrets: readonly string[]): ModelTest {
  return test.reason === null ? test : { ...test, reason: redactText(test.reason, secrets) };
}

export function createMemorySettings(options: SettingsOptions): SettingsStore {
  let drafter: DrafterChoice = { provider: "fixture" };
  const catalogs = new Map<ProviderId, ModelCatalog>();
  const tests = new Map<ProviderId, Record<string, ModelTest>>();
  return {
    async getDrafter() {
      return structuredClone(drafter);
    },
    async setDrafter(choice) {
      drafter = structuredClone(choice);
    },
    async getCatalog(provider) {
      const catalog = catalogs.get(provider);
      return catalog ? structuredClone(catalog) : null;
    },
    async saveCatalog(catalog) {
      catalogs.set(catalog.provider, structuredClone(catalog));
    },
    async getModelTests(provider) {
      return Object.fromEntries(
        Object.entries(tests.get(provider) ?? {}).map(([modelId, test]) => [
          modelId,
          redactModelTest(structuredClone(test), options.secrets),
        ]),
      );
    },
    async saveModelTest(provider, modelId, test) {
      const saved = redactModelTest(structuredClone(test), options.secrets);
      tests.set(provider, { ...tests.get(provider), [modelId]: saved });
    },
  };
}
