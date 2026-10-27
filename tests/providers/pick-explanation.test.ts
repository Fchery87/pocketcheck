import { describe, expect, it } from "vite-plus/test";
import type { PickExplanationPacket } from "../../src/lib/server/providers/contracts.ts";
import { createDeepSeekProvider } from "../../src/lib/server/providers/deepseek.ts";
import { createTheClawBayProvider } from "../../src/lib/server/providers/theclawbay.ts";

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
  picks: [
    {
      market: "moneyline",
      side: "home",
      grade: "lean",
      americanOdds: -150,
      pointLine: null,
      summary: "The forecasting model chose PHI at -150.",
      otherSideCase: "DAL at +130 pays more if the model is wrong.",
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
