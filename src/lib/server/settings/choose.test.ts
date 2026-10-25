import { describe, expect, it } from "vite-plus/test";
import { chooseDrafter } from "./choose.ts";
import { createMemorySettings } from "./store.ts";

async function settingsWithGrok(tested: boolean | null) {
  const settings = createMemorySettings();
  await settings.saveCatalog({
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
        reason: "no",
        capability: "unsupported",
      },
    ],
  });
  if (tested !== null) {
    await settings.saveModelTest("theclawbay", "grok-4.7", {
      ok: tested,
      reason: tested ? null : "HTTP 500",
      testedAt: "2026-10-25T20:01:00.000Z",
    });
  }
  return settings;
}

describe("chooseDrafter", () => {
  it("accepts the fixture drafter", async () => {
    const settings = await settingsWithGrok(null);
    expect(await chooseDrafter(settings, "fixture")).toEqual({ ok: true });
    expect(await settings.getDrafter()).toEqual({ provider: "fixture" });
  });

  it("accepts a model that passed its test", async () => {
    const settings = await settingsWithGrok(true);
    expect(await chooseDrafter(settings, "theclawbay:grok-4.7")).toEqual({ ok: true });
    expect(await settings.getDrafter()).toEqual({ provider: "theclawbay", modelId: "grok-4.7" });
  });

  it("refuses an untested, failed, unsupported, or unlisted model and keeps the old choice", async () => {
    for (const [tested, value, message] of [
      [null, "theclawbay:grok-4.7", /Test grok-4.7/],
      [false, "theclawbay:grok-4.7", /Test failed/],
      [null, "theclawbay:gpt-image-2", /not a text|no/],
      [null, "theclawbay:missing-model", /not in the TheClawBay catalog/],
      [null, "elsewhere:model", /Unknown/],
    ] as const) {
      const settings = await settingsWithGrok(tested);
      const result = await chooseDrafter(settings, value);
      expect(result.ok, value).toBe(false);
      expect(result.ok ? "" : result.error).toMatch(message);
      expect(await settings.getDrafter()).toEqual({ provider: "fixture" });
    }
  });
});
