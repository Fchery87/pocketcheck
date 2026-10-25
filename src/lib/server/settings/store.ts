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

export function createMemorySettings(): SettingsStore {
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
      return structuredClone(tests.get(provider) ?? {});
    },
    async saveModelTest(provider, modelId, test) {
      tests.set(provider, { ...tests.get(provider), [modelId]: structuredClone(test) });
    },
  };
}
