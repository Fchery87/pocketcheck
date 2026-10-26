import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { buildThesisPacket } from "../../src/lib/server/analysis/packet.ts";
import { ProviderError } from "../../src/lib/server/providers/contracts.ts";
import { createDeepSeekProvider } from "../../src/lib/server/providers/deepseek.ts";
import { createTheClawBayProvider } from "../../src/lib/server/providers/theclawbay.ts";

const FAKE_KEY = "sk-transport-test-secret-123";
const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/providers/${name}`, import.meta.url), "utf8");

const packet = buildThesisPacket({
  items: [
    {
      id: "ev-1",
      sourceId: "manual",
      url: null,
      retrievedAt: "2026-10-25T18:00:00.000Z",
      publishedAt: "unknown",
      origin: "manual",
      facts: { note: "fixture" },
      excerpt: "fixture",
      checksum: null,
      factKey: null,
    },
  ],
  decimalOdds: 1.9,
  decisiveBreakEven: 1 / 1.9,
  policy: { version: "policy-test", conclusion: "pass", blockingReason: null },
});

const usable = [
  {
    id: "grok-4.7",
    object: "model",
    compatible: true,
    reason: null,
    capability: "tested" as const,
  },
];

function provider(
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>,
  options: { timeoutMs?: number } = {},
) {
  const bodies: string[] = [];
  return {
    bodies,
    provider: createTheClawBayProvider({
      apiKey: FAKE_KEY,
      now: () => "2026-10-25T20:00:00.000Z",
      ...options,
      fetch: async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        if (init?.body) bodies.push(String(init.body));
        return respond(url, init);
      },
    }),
  };
}

/** A fetch that only settles when its request is aborted, as a real one would. */
function hanging(_url: string, init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
    );
  });
}

describe("model capability", () => {
  it("trusts DeepSeek's declared text output", async () => {
    const deep = createDeepSeekProvider({
      apiKey: FAKE_KEY,
      fetch: async () => new Response(fixture("deepseek-models.json")),
    });
    const catalog = await deep.discoverModels();
    expect(catalog.entries.map((entry) => [entry.id, entry.capability, entry.compatible])).toEqual([
      ["deepseek-flash", "declared", true],
      ["deepseek-v4-pro", "declared", true],
    ]);
  });

  it("marks a model that declares no text output as unsupported", async () => {
    const body = JSON.stringify({
      data: [{ id: "painter", object: "model", output_modalities: ["image"] }],
    });
    const deep = createDeepSeekProvider({
      apiKey: FAKE_KEY,
      fetch: async () => new Response(body),
    });
    const [entry] = (await deep.discoverModels()).entries;
    expect(entry).toMatchObject({ capability: "unsupported", compatible: false });
    expect(entry?.reason).toMatch(/no text output/);
  });

  it("leaves undeclared TheClawBay models untested and unusable until tested", async () => {
    const { provider: claw } = provider(() => new Response(fixture("theclawbay-models.json")));
    const entries = (await claw.discoverModels()).entries;
    expect(entries.find((entry) => entry.id === "grok-4.7")).toMatchObject({
      capability: "untested",
      compatible: false,
    });
    expect(entries.find((entry) => entry.id === "gpt-image-2")).toMatchObject({
      capability: "unsupported",
      compatible: false,
    });
  });

  it("tests a model with one small JSON request", async () => {
    const ok = provider(() =>
      Response.json({ choices: [{ message: { content: '{"ok": true}' } }] }),
    );
    expect(await ok.provider.testModel("grok-4.7")).toMatchObject({ ok: true, reason: null });
    expect(JSON.parse(ok.bodies[0]!)).toMatchObject({
      model: "grok-4.7",
      response_format: { type: "json_object" },
    });

    const prose = provider(() =>
      Response.json({ choices: [{ message: { content: "Sure! Here you go." } }] }),
    );
    const failed = await prose.provider.testModel("grok-4.7");
    expect(failed.ok).toBe(false);
    expect(failed.reason).toMatch(/JSON/);
  });
});

describe("provider transport", () => {
  it("raises a typed error, without the key, when the catalog request fails", async () => {
    const { provider: claw } = provider(() => new Response("nope", { status: 401 }));
    const failure = await claw.discoverModels().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProviderError);
    expect((failure as ProviderError).kind).toBe("auth");
    expect(String((failure as Error).message)).not.toContain(FAKE_KEY);
  });

  it("times out a catalog request that never answers", async () => {
    const { provider: claw } = provider(hanging, { timeoutMs: 20 });
    const failure = await claw.discoverModels().catch((error: unknown) => error);
    expect((failure as ProviderError).kind).toBe("timeout");
  });

  it("asks for a JSON object with room for reasoning tokens", async () => {
    const { provider: claw, bodies } = provider(() =>
      Response.json({ choices: [{ message: { content: "{}" } }] }),
    );
    await claw.draftThesis({ modelId: "grok-4.7", catalog: usable, packet });
    const sent = JSON.parse(bodies[0]!);
    expect(sent.response_format).toEqual({ type: "json_object" });
    expect(sent.max_tokens).toBeGreaterThanOrEqual(8000);
  });

  it("fails the draft on a timeout and keeps the packet", async () => {
    const { provider: claw } = provider(hanging, { timeoutMs: 20 });
    const result = await claw.draftThesis({ modelId: "grok-4.7", catalog: usable, packet });
    expect(result.draftingFailed).toBe(true);
    expect(result.error?.kind).toBe("timeout");
    expect(result.packet).toEqual(packet);
  });

  it("fails the draft when the network is down instead of throwing", async () => {
    const { provider: claw } = provider(() => {
      throw new TypeError("fetch failed");
    });
    const result = await claw.draftThesis({ modelId: "grok-4.7", catalog: usable, packet });
    expect(result.draftingFailed).toBe(true);
    expect(result.error?.kind).toBe("transport");
  });

  it("reads xAI-style cost ticks as US dollars", async () => {
    const { provider: claw } = provider(() =>
      Response.json({
        choices: [{ message: { content: "{}" } }],
        usage: {
          prompt_tokens: 2844,
          completion_tokens: 167,
          total_tokens: 3011,
          cost_in_usd_ticks: 16870800,
        },
      }),
    );
    const result = await claw.draftThesis({ modelId: "grok-4.7", catalog: usable, packet });
    expect(result.usageCost).toBeCloseTo(0.00168708, 10);
  });

  it("keeps both metered responses and does not invent a missing cost", async () => {
    let calls = 0;
    const { provider: claw, bodies } = provider(() => {
      calls += 1;
      if (calls === 1) {
        return Response.json({
          id: "req-draft",
          choices: [{ message: { content: "not-json" } }],
          usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.01 },
        });
      }
      return Response.json({
        id: "req-repair",
        choices: [{ message: { content: "{}" } }],
        usage: { prompt_tokens: 40, completion_tokens: 10 },
      });
    });
    const result = await claw.draftThesis({ modelId: "grok-4.7", catalog: usable, packet });
    expect(bodies).toHaveLength(2);
    expect(result.providerRequests).toEqual([
      expect.objectContaining({
        requestId: "req-draft",
        role: "draft",
        outcome: "completed",
        promptTokens: 100,
        costUsd: 0.01,
        costKnown: true,
      }),
      expect.objectContaining({
        requestId: "req-repair",
        role: "repair",
        outcome: "completed",
        promptTokens: 40,
        totalTokens: null,
        costUsd: null,
        costKnown: false,
      }),
    ]);
    expect(JSON.stringify(result.providerRequests)).not.toContain(FAKE_KEY);
  });

  it("keeps the first request when the repair request fails in transit", async () => {
    let calls = 0;
    const { provider: claw } = provider(() => {
      calls += 1;
      if (calls === 1) {
        return Response.json({
          id: "req-draft",
          choices: [{ message: { content: "not-json" } }],
          usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100, cost: 0.02 },
        });
      }
      throw new TypeError("fetch failed");
    });
    const result = await claw.draftThesis({ modelId: "grok-4.7", catalog: usable, packet });
    expect(result.draftingFailed).toBe(true);
    expect(result.repairAttempted).toBe(true);
    expect(result.providerRequests?.[0]).toMatchObject({
      requestId: "req-draft",
      promptTokens: 80,
      costUsd: 0.02,
      costKnown: true,
    });
    expect(result.providerRequests?.[1]).toMatchObject({
      role: "repair",
      outcome: "failed",
      costUsd: null,
      costKnown: false,
    });
  });

  it("marks a sent request that times out as ambiguous rather than a known miss", async () => {
    const { provider: claw } = provider(hanging, { timeoutMs: 20 });
    const result = await claw.draftThesis({ modelId: "grok-4.7", catalog: usable, packet });
    expect(result.providerRequests?.[0]).toMatchObject({
      role: "draft",
      outcome: "ambiguous",
      response: null,
      costKnown: false,
    });
  });
});
