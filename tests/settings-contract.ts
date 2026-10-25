import { describe, expect, it } from "vite-plus/test";
import type { SettingsStore } from "#lib/server/settings/store.ts";
import type { ModelCatalog } from "#lib/server/providers/contracts.ts";

const catalog: ModelCatalog = {
  provider: "theclawbay",
  baseUrl: "https://api.theclawbay.com/v1",
  retrievedAt: "2026-10-25T20:00:00.000Z",
  entries: [
    {
      id: "grok-4.7",
      object: "model",
      compatible: false,
      reason: "untested",
      capability: "untested",
    },
    {
      id: "gpt-image-2",
      object: "model",
      compatible: false,
      reason: "not text",
      capability: "unsupported",
    },
  ],
};

/** Shared by the memory settings store and the Neon settings store. */
export function describeSettingsContract(name: string, makeStore: () => SettingsStore) {
  describe(`${name} settings store`, () => {
    it("uses the fixture drafter until a model is chosen", async () => {
      expect(await makeStore().getDrafter()).toEqual({ provider: "fixture" });
    });

    it("keeps the chosen provider and model", async () => {
      const store = makeStore();
      await store.setDrafter({ provider: "deepseek", modelId: "deepseek-flash" });
      expect(await store.getDrafter()).toEqual({ provider: "deepseek", modelId: "deepseek-flash" });
      await store.setDrafter({ provider: "fixture" });
      expect(await store.getDrafter()).toEqual({ provider: "fixture" });
    });

    it("caches a catalog with its retrieval time and replaces it on refresh", async () => {
      const store = makeStore();
      expect(await store.getCatalog("theclawbay")).toBeNull();
      await store.saveCatalog(catalog);
      expect(await store.getCatalog("theclawbay")).toEqual(catalog);
      const refreshed = { ...catalog, retrievedAt: "2026-10-25T21:00:00.000Z", entries: [] };
      await store.saveCatalog(refreshed);
      expect(await store.getCatalog("theclawbay")).toEqual(refreshed);
    });

    it("keeps the latest test result per model", async () => {
      const store = makeStore();
      await store.saveModelTest("theclawbay", "grok-4.7", {
        ok: false,
        reason: "HTTP 500",
        testedAt: "2026-10-25T20:00:00.000Z",
      });
      await store.saveModelTest("theclawbay", "grok-4.7", {
        ok: true,
        reason: null,
        testedAt: "2026-10-25T20:05:00.000Z",
      });
      expect(await store.getModelTests("theclawbay")).toEqual({
        "grok-4.7": { ok: true, reason: null, testedAt: "2026-10-25T20:05:00.000Z" },
      });
      expect(await store.getModelTests("deepseek")).toEqual({});
    });
  });
}
