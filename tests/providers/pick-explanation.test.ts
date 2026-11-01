import { describe, expect, it } from "vite-plus/test";
import type { PickExplanationPacket } from "../../src/lib/server/providers/contracts.ts";
import { createDeepSeekProvider } from "../../src/lib/server/providers/deepseek.ts";
import { createTheClawBayProvider } from "../../src/lib/server/providers/theclawbay.ts";
import { validatePickExplanation } from "../../src/lib/server/analysis/pick-explanation.ts";
import { createFixtureDrafter } from "../../src/lib/server/analysis/fixture-drafter.ts";
import type { ProviderRequestRecord } from "../../src/lib/server/providers/contracts.ts";

const FAKE_KEY = "sk-pick-explanation-secret-456";

const packet: PickExplanationPacket = {
  game: { home: "PHI", away: "DAL" },
  picks: [
    {
      market: "moneyline",
      grade: "lean",
      release: "unvalidated",
      tieBreak: "expected value",
      materialEvidenceMissing: false,
      picked: {
        selection: "home",
        label: "PHI",
        pointLine: null,
        americanOdds: -150,
        modelWinProbability: 0.62,
        noVigProbability: 0.579832,
        expectedValue: 0.053333,
      },
      other: {
        selection: "away",
        label: "DAL",
        pointLine: null,
        americanOdds: 130,
        modelWinProbability: 0.36,
        noVigProbability: 0.420168,
        expectedValue: -0.152,
      },
      drivers: [{ feature: "home_indicator", points: 1.5 }],
    },
  ],
  items: [
    {
      id: "ev-1",
      sourceId: "manual",
      url: null,
      retrievedAt: "2026-10-25T18:00:00.000Z",
      publishedAt: "unknown",
      origin: "manual",
      facts: {},
      excerpt: "fixture",
      checksum: null,
      factKey: null,
    },
  ],
  gaps: ["No injury report was found."],
};

const usable = [
  {
    id: "grok-4.7",
    object: "model",
    compatible: true,
    reason: null,
    capability: "tested" as const,
  },
];

const valid = {
  formatVersion: 2,
  picks: [
    {
      market: "moneyline",
      side: "home",
      grade: "lean",
      americanOdds: -150,
      pointLine: null,
      summary: "The forecasting model chose {{picked.label}}.",
      otherSideCase: "{{other.label}} could win if the model is wrong.",
      claims: [
        { text: "The matchup is as scheduled.", stance: "supporting", evidenceIds: ["ev-1"] },
        { text: "Nothing here shows an edge.", stance: "opposing", evidenceIds: ["ev-1"] },
      ],
      missingInputs: ["No injury report was found."],
    },
  ],
};

function reply(content: unknown, usage?: Record<string, unknown>, id = "resp-1") {
  return new Response(
    JSON.stringify({
      id,
      choices: [{ message: { content: JSON.stringify(content) } }],
      ...(usage ? { usage } : {}),
    }),
    { status: 200 },
  );
}

function makeProvider(
  make: typeof createTheClawBayProvider,
  respond: (n: number) => Response | Promise<Response>,
) {
  const bodies: string[] = [];
  let calls = 0;
  const provider = make({
    apiKey: FAKE_KEY,
    fetch: async (_input, init) => {
      bodies.push(String(init?.body));
      calls += 1;
      return respond(calls);
    },
  });
  return { provider, bodies };
}

describe.each([
  ["TheClawBay", createTheClawBayProvider],
  ["DeepSeek", createDeepSeekProvider],
])("%s pick explanation", (_name, make) => {
  it("keeps draft accounting durable when repair transport fails", async () => {
    const saved: ProviderRequestRecord[] = [];
    const events: string[] = [];
    const { provider } = makeProvider(make, (n) => {
      events.push(`send-${n}`);
      if (n === 2) throw new Error("repair transport failed");
      return reply({ ...valid, picks: [] }, { total_tokens: 12, cost: 0.002 });
    });
    const drafted = await provider.draftPickExplanation({
      modelId: "grok-4.7",
      catalog: usable,
      packet,
      beforeRequest: async ({ role }) => {
        events.push(`reserve-${role}`);
      },
      afterResponse: async (record) => {
        saved.push(record);
        events.push(`save-${record.role}`);
      },
    });
    expect(events).toEqual([
      "reserve-draft",
      "send-1",
      "save-draft",
      "reserve-repair",
      "send-2",
      "save-repair",
    ]);
    expect(saved).toEqual(drafted.providerRequests);
    expect(saved[0]).toMatchObject({ costUsd: 0.002, totalTokens: 12 });
    expect(saved[1]).toMatchObject({ outcome: "failed", costUsd: null });
  });
  it("accepts verified entity digits and ordinary football terms without repairing", async () => {
    const context = structuredClone(packet);
    context.game.away = "SF";
    context.picks[0]!.other.label = "SF";
    const report = structuredClone(valid);
    report.picks[0]!.otherSideCase =
      "The 49ers could force QB1 into difficult 3rd down situations.";
    expect(validatePickExplanation(report, context).ok).toBe(true);
    const { provider, bodies } = makeProvider(make, () => reply(report));
    expect(
      (
        await provider.draftPickExplanation({
          modelId: "grok-4.7",
          catalog: usable,
          packet: context,
        })
      ).draftingFailed,
    ).toBe(false);
    expect(bodies).toHaveLength(1);
  });

  it.each([
    "The 49ers are dangerous.",
    "Week 9 changes this matchup.",
    "The line is 3.5.",
    "The price is +130.",
    "They win 62%.",
    "{{evidence:ev-1:missing}}",
  ])("repairs unsupported numeric prose %s", async (summary) => {
    const report = structuredClone(valid);
    report.picks[0]!.summary = summary;
    expect(validatePickExplanation(report, packet).ok).toBe(false);
    const { provider, bodies } = makeProvider(make, (n) => reply(n === 1 ? report : valid));
    const drafted = await provider.draftPickExplanation({
      modelId: "grok-4.7",
      catalog: usable,
      packet,
    });
    expect(drafted.draftingFailed).toBe(false);
    expect(drafted.repairAttempted).toBe(true);
    expect(bodies).toHaveLength(2);
  });
  it("persists each response before reserving repair and stops on persistence failure", async () => {
    const events: string[] = [];
    const { provider, bodies } = makeProvider(make, () => {
      events.push("transport");
      return reply({ ...valid, picks: [] });
    });
    await expect(
      provider.draftPickExplanation({
        modelId: "grok-4.7",
        catalog: usable,
        packet,
        beforeRequest: async ({ role }) => {
          events.push(`reserve-${role}`);
        },
        afterResponse: async (record) => {
          events.push(`persist-${record.role}`);
          throw new Error("storage unavailable");
        },
      }),
    ).rejects.toThrow("storage unavailable");
    expect(events).toEqual(["reserve-draft", "transport", "persist-draft"]);
    expect(bodies).toHaveLength(1);
  });

  it("never sends when reservation rejects", async () => {
    const { provider, bodies } = makeProvider(make, () => reply(valid));
    await expect(
      provider.draftPickExplanation({
        modelId: "grok-4.7",
        catalog: usable,
        packet,
        beforeRequest: async () => {
          throw new Error("already reserved");
        },
      }),
    ).rejects.toThrow("already reserved");
    expect(bodies).toHaveLength(0);
  });

  it("reuses a durable response without another paid request", async () => {
    const { provider, bodies } = makeProvider(make, () => reply(valid));
    const drafted = await provider.draftPickExplanation({
      modelId: "grok-4.7",
      catalog: usable,
      packet,
      beforeRequest: async ({ role }) => ({
        response: {
          requestId: "saved",
          role,
          outcome: "completed",
          response: JSON.stringify(valid),
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
          costUsd: 0.002,
          costKnown: true,
        },
      }),
    });
    expect(drafted.draftingFailed).toBe(false);
    expect(bodies).toHaveLength(0);
    expect(drafted.providerRequests?.[0]?.requestId).toBe("saved");
  });
  it("sends the frozen picks and evidence, never a lean, and returns the validated text", async () => {
    const { provider, bodies } = makeProvider(make, () =>
      reply(valid, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.002 }),
    );
    const drafted = await provider.draftPickExplanation({
      modelId: "grok-4.7",
      catalog: usable,
      packet,
    });
    expect(drafted.draftingFailed).toBe(false);
    expect(drafted.report!.picks[0]).toMatchObject({ market: "moneyline", side: "home" });
    expect(bodies).toHaveLength(1);
    const sent = JSON.parse(JSON.parse(bodies[0]!).messages[1].content);
    expect(sent.picks[0].picked).toMatchObject({ label: "PHI", americanOdds: -150 });
    expect(sent.evidence.map((item: { id: string }) => item.id)).toEqual(["ev-1"]);
    expect(bodies[0]).not.toContain(FAKE_KEY);
    expect(drafted.providerRequests).toHaveLength(1);
    expect(drafted.providerRequests![0]).toMatchObject({ role: "draft", outcome: "completed" });
  });

  it("repairs a contradiction once, repeats the reasons, and keeps both exchanges", async () => {
    const wrong = structuredClone(valid);
    wrong.picks[0]!.side = "away";
    const { provider, bodies } = makeProvider(make, (n) =>
      n === 1
        ? reply(wrong, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.002 })
        : reply(
            valid,
            { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18, cost: 0.003 },
            "resp-2",
          ),
    );
    const drafted = await provider.draftPickExplanation({
      modelId: "grok-4.7",
      catalog: usable,
      packet,
    });
    expect(drafted.draftingFailed).toBe(false);
    expect(drafted.repairAttempted).toBe(true);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toContain("frozen side");
    expect(drafted.providerRequests!.map((item) => item.role)).toEqual(["draft", "repair"]);
  });

  it("fails closed after one repair, with no further request and no provider fallback", async () => {
    const wrong = structuredClone(valid);
    wrong.picks[0]!.grade = "strong";
    const { provider, bodies } = makeProvider(make, () => reply(wrong));
    const drafted = await provider.draftPickExplanation({
      modelId: "grok-4.7",
      catalog: usable,
      packet,
    });
    expect(drafted.draftingFailed).toBe(true);
    expect(drafted.report).toBeNull();
    expect(drafted.error?.kind).toBe("invalid_report");
    expect(bodies).toHaveLength(2);
  });

  it("refuses a removed model without sending a request", async () => {
    const { provider, bodies } = makeProvider(make, () => reply(valid));
    const drafted = await provider.draftPickExplanation({
      modelId: "gone",
      catalog: usable,
      packet,
    });
    expect(drafted.refusal).toBe("removed");
    expect(bodies).toHaveLength(0);
  });

  it("records a timeout as an ambiguous request and leaves cost unknown", async () => {
    const provider = make({
      apiKey: FAKE_KEY,
      timeoutMs: 5,
      fetch: (_input, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    });
    const drafted = await provider.draftPickExplanation({
      modelId: "grok-4.7",
      catalog: usable,
      packet,
    });
    expect(drafted.draftingFailed).toBe(true);
    expect(drafted.providerRequests![0]).toMatchObject({
      outcome: "ambiguous",
      costKnown: false,
      costUsd: null,
    });
  });
});

it("fixture drafter reserves and persists a reusable response", async () => {
  const saved: ProviderRequestRecord[] = [];
  const drafter = createFixtureDrafter();
  const first = await drafter.draftPickExplanation({
    modelId: drafter.modelId,
    catalog: [],
    packet,
    beforeRequest: async ({ role, body }) => {
      expect(role).toBe("draft");
      expect(JSON.parse(body).model).toBe(drafter.modelId);
    },
    afterResponse: async (record) => {
      saved.push(record);
    },
  });
  const reused = await drafter.draftPickExplanation({
    modelId: drafter.modelId,
    catalog: [],
    packet,
    beforeRequest: async () => ({ response: saved[0]! }),
    afterResponse: async () => {
      throw new Error("already persisted");
    },
  });
  expect(first.draftingFailed).toBe(false);
  expect(reused).toEqual(first);
});
