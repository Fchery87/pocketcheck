import { describe, expect, it } from "vite-plus/test";
import { buildThesisPacket } from "../analysis/packet.ts";
import { createMemorySettings } from "../settings/store.ts";
import type { ModelCatalogEntry, ProviderId, ThesisProvider } from "./contracts.ts";
import { resolveDrafter } from "./drafter.ts";

const packet = buildThesisPacket({
  items: [],
  decimalOdds: 1.9,
  decisiveBreakEven: 1 / 1.9,
  policy: { version: "policy-test", conclusion: "pass", blockingReason: null },
});

/** Records the catalog each draft was given; never touches the network. */
function fakeProvider(id: ProviderId, seen: ModelCatalogEntry[][]): ThesisProvider {
  return {
    id,
    baseUrl: `https://${id}.example`,
    discoverModels: async () => {
      throw new Error("not used");
    },
    testModel: async () => {
      throw new Error("not used");
    },
    selectionStatus: () => ({ status: "available", modelId: "x" }),
    draftThesis: async (input) => {
      seen.push(input.catalog);
      return {
        draftingFailed: true,
        repairAttempted: false,
        refusal: null,
        error: null,
        report: null,
        packet: input.packet,
        usage: null,
        usageCost: null,
        modelId: input.modelId,
      };
    },
  };
}

const grok: ModelCatalogEntry = {
  id: "grok-4.7",
  object: "model",
  compatible: false,
  reason: "untested",
  capability: "untested",
};

describe("resolveDrafter", () => {
  it("keeps the fixture choice even when both provider credentials are present", async () => {
    const resolved = await resolveDrafter({
      settings: createMemorySettings(),
      keys: { theclawbay: "synthetic-never-valid", deepseek: "synthetic-never-valid" },
      makeProvider: () => {
        throw new Error("no provider expected");
      },
    });
    expect(resolved.ok && resolved.drafter.id).toBe("fixture");
  });

  it("refuses a provider whose key is not configured, without falling back", async () => {
    const settings = createMemorySettings();
    await settings.setDrafter({ provider: "deepseek", modelId: "deepseek-flash" });
    const resolved = await resolveDrafter({
      settings,
      keys: {},
      makeProvider: (id) => fakeProvider(id, []),
    });
    expect(resolved.ok).toBe(false);
    expect(resolved.ok ? "" : resolved.error).toMatch(/DEEPSEEK_API_KEY/);
  });

  it("refuses a provider with no cached catalog", async () => {
    const settings = createMemorySettings();
    await settings.setDrafter({ provider: "theclawbay", modelId: "grok-4.7" });
    const resolved = await resolveDrafter({
      settings,
      keys: { theclawbay: "sk-not-a-real-key-000000" },
      makeProvider: (id) => fakeProvider(id, []),
    });
    expect(resolved.ok ? "" : resolved.error).toMatch(/Refresh the TheClawBay catalog/);
  });

  it("drafts with the chosen model and the catalog as tested", async () => {
    const settings = createMemorySettings();
    await settings.setDrafter({ provider: "theclawbay", modelId: "grok-4.7" });
    await settings.saveCatalog({
      provider: "theclawbay",
      baseUrl: "https://theclawbay.example",
      retrievedAt: "2026-10-25T20:00:00.000Z",
      entries: [grok],
    });
    await settings.saveModelTest("theclawbay", "grok-4.7", {
      ok: true,
      reason: null,
      testedAt: "2026-10-25T20:01:00.000Z",
    });
    const seen: ModelCatalogEntry[][] = [];
    const resolved = await resolveDrafter({
      settings,
      keys: { theclawbay: "sk-not-a-real-key-000000" },
      makeProvider: (id) => fakeProvider(id, seen),
    });
    if (!resolved.ok) throw new Error(resolved.error);
    expect(resolved.drafter).toMatchObject({ id: "theclawbay", modelId: "grok-4.7" });
    await resolved.drafter.draftThesis({ modelId: "grok-4.7", catalog: [], packet });
    expect(seen[0]).toEqual([{ ...grok, compatible: true, reason: null, capability: "tested" }]);
  });
});
