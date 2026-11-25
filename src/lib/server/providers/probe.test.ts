import { describe, expect, it } from "vite-plus/test";
import { ProviderError, type ModelCatalog, type ThesisProvider } from "./contracts.ts";
import { probeProviderKey } from "./probe.ts";

const catalog: ModelCatalog = {
  provider: "theclawbay",
  baseUrl: "https://provider.test",
  retrievedAt: "2026-11-24T00:00:00.000Z",
  entries: [],
};

function provider(
  discover: ThesisProvider["discoverModels"],
): Pick<ThesisProvider, "discoverModels"> {
  return { discoverModels: discover };
}

describe("provider key health", () => {
  it("reports a key the catalog accepts", async () => {
    expect(await probeProviderKey(provider(async () => catalog))).toEqual({ state: "ok" });
  });

  it("reports a key the provider rejects", async () => {
    const health = await probeProviderKey(
      provider(async () => {
        throw new ProviderError("auth", "Model catalog request failed with HTTP 401", 401);
      }),
    );
    expect(health).toEqual({
      state: "rejected",
      detail: "Model catalog request failed with HTTP 401",
    });
  });

  it("reports an unreachable provider without calling the key invalid", async () => {
    const health = await probeProviderKey(
      provider(async () => {
        throw new ProviderError("timeout", "/models timed out after 15000ms");
      }),
    );
    expect(health).toEqual({ state: "unreachable", detail: "/models timed out after 15000ms" });
  });

  it("reports an unexpected failure as unreachable", async () => {
    const health = await probeProviderKey(
      provider(async () => {
        throw new Error("boom");
      }),
    );
    expect(health).toEqual({ state: "unreachable", detail: "boom" });
  });
});
