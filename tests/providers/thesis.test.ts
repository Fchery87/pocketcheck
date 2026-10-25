import { describe, expect, it } from "vite-plus/test";
import { americanToDecimal, breakEven } from "../../src/lib/domain/odds.ts";
import { buildThesisPacket, thesisRequestBody } from "../../src/lib/server/analysis/packet.ts";
import { validateThesisReport } from "../../src/lib/server/analysis/report-validation.ts";
import type { EvidenceItem } from "../../src/lib/server/sources/contracts.ts";
import { createDeepSeekProvider } from "../../src/lib/server/providers/deepseek.ts";
import { selectThesisModel } from "../../src/lib/server/providers/selection.ts";
import { createTheClawBayProvider } from "../../src/lib/server/providers/theclawbay.ts";
import type {
  ModelCatalogEntry,
  ThesisProvider,
} from "../../src/lib/server/providers/contracts.ts";
import { renderThesisExport } from "../../src/lib/server/analysis/export.ts";

const FAKE_KEY = "sk-test-secret";

const items: EvidenceItem[] = [
  {
    id: "ev-injury",
    sourceId: "manual",
    url: null,
    retrievedAt: "2026-10-25T18:00:00.000Z",
    publishedAt: "unknown",
    origin: "manual",
    facts: { player: "Jalen Hurts", status: "questionable" },
    excerpt: "Hurts is listed questionable.",
    checksum: null,
    factKey: "phi-qb",
  },
  {
    id: "ev-weather",
    sourceId: "nws",
    url: "https://api.weather.gov/example",
    retrievedAt: "2026-10-25T18:00:00.000Z",
    publishedAt: "2026-10-25T17:00:00.000Z",
    origin: "automatic",
    facts: { wind: "12 mph" },
    excerpt: "Wind 12 mph at kickoff.",
    checksum: "abc",
    factKey: null,
  },
];

function catalogBody(ids: Array<{ id: string; object?: string }>) {
  return JSON.stringify({
    object: "list",
    data: ids.map((entry) => ({
      id: entry.id,
      object: entry.object ?? "model",
      owned_by: "fixture",
    })),
  });
}

type Call = { url: string; init?: RequestInit };

function mockFetch(handler: (call: Call, calls: Call[]) => Response | Promise<Response>): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const call = { url, init };
    calls.push(call);
    return handler(call, calls);
  };
  return { fetch: fetchImpl, calls };
}

function calculations() {
  const decimalOdds = americanToDecimal(-150);
  const decisiveBreakEven = breakEven(decimalOdds).decisive;
  return { decimalOdds, decisiveBreakEven };
}

function packet(policyConclusion = "insufficient evidence") {
  const math = calculations();
  return buildThesisPacket({
    items,
    decimalOdds: math.decimalOdds,
    decisiveBreakEven: math.decisiveBreakEven,
    policy: {
      version: "policy-test",
      conclusion: policyConclusion,
      blockingReason: "Material evidence is missing.",
    },
  });
}

function validReportJson() {
  const math = calculations();
  return JSON.stringify({
    conclusion: "insufficient evidence",
    summary: "The packet does not establish a side.",
    claims: [
      {
        text: "Hurts is listed questionable.",
        stance: "opposing",
        evidenceIds: ["ev-injury"],
      },
    ],
    assumptions: ["Questionable status may change before kickoff."],
    uncertainty: "Lineup is unresolved.",
    missingInputs: ["Confirmed inactives"],
    changeConditions: ["Hurts is ruled out"],
    decimalOdds: math.decimalOdds,
    decisiveBreakEven: math.decisiveBreakEven,
  });
}

function chatResponse(content: string, usage?: Record<string, unknown> | null) {
  const body: Record<string, unknown> = {
    id: "chatcmpl-fixture",
    choices: [{ message: { role: "assistant", content } }],
  };
  if (usage !== null) {
    body.usage = usage ?? { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 };
  }
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("model discovery", () => {
  it("lists every TheClawBay catalog entry and prefers grok-4.7 only when present", async () => {
    const retrievedAt = "2026-10-25T20:00:00.000Z";
    const { fetch } = mockFetch(
      () =>
        new Response(
          catalogBody([
            { id: "grok-4.7" },
            { id: "deepseek-chat" },
            { id: "dall-e-image", object: "image" },
            { id: "text-embed-3" },
          ]),
          { status: 200 },
        ),
    );
    const provider = createTheClawBayProvider({ apiKey: FAKE_KEY, fetch, now: () => retrievedAt });
    const catalog = await provider.discoverModels();
    expect(catalog.retrievedAt).toBe(retrievedAt);
    expect(catalog.entries.map((entry) => entry.id)).toEqual([
      "grok-4.7",
      "deepseek-chat",
      "dall-e-image",
      "text-embed-3",
    ]);
    expect(catalog.baseUrl).toBe("https://api.theclawbay.com/v1");
    const selection = selectThesisModel(catalog.entries, { provider: "theclawbay" });
    expect(selection.preferredId).toBe("grok-4.7");
    expect(selection.entries.find((entry) => entry.id === "dall-e-image")).toMatchObject({
      compatible: false,
      reason: "not a text thesis model",
    });
    expect(selection.entries.find((entry) => entry.id === "text-embed-3")?.compatible).toBe(false);
    // Listed but untested: TheClawBay does not declare capabilities.
    expect(selection.entries.find((entry) => entry.id === "grok-4.7")).toMatchObject({
      compatible: false,
      capability: "untested",
    });
  });

  it("does not substitute another provider when grok-4.7 is absent", async () => {
    const { fetch } = mockFetch(
      () =>
        new Response(
          catalogBody([{ id: "deepseek-chat" }, { id: "whisper-audio", object: "audio" }]),
          { status: 200 },
        ),
    );
    const claw = createTheClawBayProvider({
      apiKey: FAKE_KEY,
      fetch,
      now: () => "2026-10-25T20:00:00.000Z",
    });
    const catalog = await claw.discoverModels();
    const selection = selectThesisModel(catalog.entries, { provider: "theclawbay" });
    expect(selection.preferredId).toBeNull();
    expect(selection.entries.find((entry) => entry.id === "whisper-audio")?.reason).toBe(
      "not a text thesis model",
    );

    const deep = createDeepSeekProvider({
      apiKey: FAKE_KEY,
      fetch: mockFetch(() => new Response(catalogBody([{ id: "grok-4.7" }]), { status: 200 }))
        .fetch,
      now: () => "2026-10-25T20:00:00.000Z",
    });
    const deepCatalog = await deep.discoverModels();
    expect(deepCatalog.baseUrl).toBe("https://api.deepseek.com");
    expect(selectThesisModel(deepCatalog.entries, { provider: "deepseek" }).preferredId).toBeNull();
  });

  it("refuses drafting when the selected model disappears on refresh", async () => {
    let models = catalogBody([{ id: "grok-4.7" }, { id: "deepseek-chat" }]);
    const { fetch } = mockFetch((call) => {
      if (call.url.endsWith("/models")) return new Response(models, { status: 200 });
      return chatResponse(validReportJson());
    });
    const provider = createTheClawBayProvider({
      apiKey: FAKE_KEY,
      fetch,
      now: () => "2026-10-25T20:00:00.000Z",
    });
    const first = await provider.discoverModels();
    const selected = "grok-4.7";
    expect(first.entries.some((entry) => entry.id === selected)).toBe(true);
    models = catalogBody([{ id: "deepseek-chat" }]);
    const refreshed = await provider.discoverModels();
    const status = provider.selectionStatus(selected, refreshed.entries);
    expect(status).toEqual({ status: "removed", modelId: selected });
    const draft = await provider.draftThesis({
      modelId: selected,
      catalog: refreshed.entries,
      packet: packet(),
    });
    expect(draft.draftingFailed).toBe(true);
    expect(draft.refusal).toBe("removed");
    expect(draft.packet.items.map((item) => item.id)).toEqual(["ev-injury", "ev-weather"]);
    expect(draft.packet.decimalOdds).toBe(calculations().decimalOdds);
  });
});

describe("thesis drafting", () => {
  function providerWith(handler: (call: Call, calls: Call[]) => Response): {
    provider: ThesisProvider;
    calls: Call[];
  } {
    const mocked = mockFetch(handler);
    return {
      calls: mocked.calls,
      provider: createTheClawBayProvider({
        apiKey: FAKE_KEY,
        fetch: mocked.fetch,
        now: () => "2026-10-25T20:00:00.000Z",
      }),
    };
  }

  const compatible: ModelCatalogEntry[] = [
    { id: "grok-4.7", object: "model", compatible: true, reason: null, capability: "tested" },
  ];

  it("sends the evidence packet and precomputed numbers without the user lean", async () => {
    const { provider, calls } = providerWith((call) => {
      if (call.url.endsWith("/models"))
        return new Response(catalogBody([{ id: "grok-4.7" }]), { status: 200 });
      return chatResponse(validReportJson());
    });
    const result = await provider.draftThesis({
      modelId: "grok-4.7",
      catalog: compatible,
      packet: packet(),
    });
    expect(result.draftingFailed).toBe(false);
    const bodies = calls
      .filter((call) => call.url.includes("chat/completions"))
      .map((call) => String(call.init?.body));
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body).not.toMatch(/lean/i);
      expect(body).not.toMatch(/rationale/i);
      expect(body).not.toContain("I like Philadelphia");
      expect(body).toContain("ev-injury");
      expect(body).toContain(String(calculations().decimalOdds));
      expect(body).toContain("insufficient evidence");
      expect(body).toContain("Material evidence is missing.");
    }
    expect(result.report?.claims[0]?.evidenceIds).toEqual(["ev-injury"]);
    expect(JSON.stringify(result)).not.toContain(FAKE_KEY);
    expect(renderThesisExport(result)).not.toContain(FAKE_KEY);
  });

  it("rejects an invented evidence id and a model-supplied probability", () => {
    const math = calculations();
    const invented = validateThesisReport(
      {
        conclusion: "experimental lean",
        summary: "bad",
        claims: [{ text: "made up", stance: "supporting", evidenceIds: ["ev-missing"] }],
        assumptions: [],
        uncertainty: "none",
        missingInputs: [],
        changeConditions: [],
        decimalOdds: math.decimalOdds,
        decisiveBreakEven: math.decisiveBreakEven,
      },
      packet(),
    );
    expect(invented.ok).toBe(false);
    expect(invented.reasons.join(" ")).toMatch(/ev-missing/);

    const probability = validateThesisReport(
      {
        conclusion: "experimental lean",
        summary: "bad",
        claims: [{ text: "cited", stance: "supporting", evidenceIds: ["ev-injury"] }],
        assumptions: [],
        uncertainty: "none",
        missingInputs: [],
        changeConditions: [],
        decimalOdds: math.decimalOdds,
        decisiveBreakEven: math.decisiveBreakEven,
        winProbability: 0.62,
      },
      packet(),
    );
    expect(probability.ok).toBe(false);
    expect(probability.reasons.join(" ")).toMatch(/probabilit/i);
  });

  it("rejects a report conclusion that disagrees with the policy result", () => {
    const math = calculations();
    const disagreed = validateThesisReport(
      {
        conclusion: "experimental value candidate",
        summary: "model overrode the policy",
        claims: [],
        assumptions: [],
        uncertainty: "none",
        missingInputs: [],
        changeConditions: [],
        decimalOdds: math.decimalOdds,
        decisiveBreakEven: math.decisiveBreakEven,
      },
      packet("pass"),
    );
    expect(disagreed.ok).toBe(false);
    if (!disagreed.ok) {
      expect(disagreed.reasons.join(" ")).toMatch(/disagrees with the policy result/);
    }
  });

  function reportWith(overrides: Record<string, unknown>) {
    return { ...JSON.parse(validReportJson()), ...overrides };
  }

  it("names each field that has the wrong shape", () => {
    // What grok-4.7 returned on 2026-10-25 before the prompt spelled out the types.
    const result = validateThesisReport(
      reportWith({
        claims: [{ text: "Hurts is questionable.", stance: "oppose", evidenceIds: ["ev-injury"] }],
        uncertainty: ["Lineup is unresolved."],
      }),
      packet(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(
      /claims\[0\]\.stance must be "supporting" or "opposing"/,
    );
    expect(result.reasons.join(" ")).toMatch(/uncertainty must be a string/);
  });

  it("tells the model each field's type and allowed values", () => {
    const body = JSON.parse(thesisRequestBody({ modelId: "m", packet: packet() }));
    const rules = body.messages[0].content as string;
    expect(rules).toContain('stance is exactly "supporting" or "opposing"');
    expect(rules).toMatch(/uncertainty: string/);
  });

  it("rejects a claim that cites no evidence", () => {
    const result = validateThesisReport(
      reportWith({
        claims: [
          { text: "Philadelphia looks sharp.", stance: "supporting", evidenceIds: [] },
          { text: "Hurts is listed questionable.", stance: "opposing", evidenceIds: ["ev-injury"] },
        ],
      }),
      packet(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toMatch(/cites no evidence/);
  });

  it("rejects supporting claims with no opposing claim", () => {
    const result = validateThesisReport(
      reportWith({
        claims: [{ text: "Wind is light.", stance: "supporting", evidenceIds: ["ev-weather"] }],
      }),
      packet(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toMatch(/opposing/);
  });

  it("rejects a probability field nested inside a claim", () => {
    const result = validateThesisReport(
      reportWith({
        claims: [
          {
            text: "Hurts is listed questionable.",
            stance: "opposing",
            evidenceIds: ["ev-injury"],
            coverProbability: 0.55,
          },
        ],
      }),
      packet(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join(" ")).toMatch(/claims\[0\]\.coverProbability/);
  });

  it("rejects an invented percentage in prose but allows the supplied break-even", () => {
    const breakEvenText = `${(calculations().decisiveBreakEven * 100).toFixed(2)}%`;
    const invented = validateThesisReport(
      reportWith({ summary: "Philadelphia covers about 62% of the time." }),
      packet(),
    );
    expect(invented.ok).toBe(false);
    if (!invented.ok) expect(invented.reasons.join(" ")).toMatch(/62%/);

    const spelled = validateThesisReport(
      reportWith({ uncertainty: "Roughly 70 percent confident." }),
      packet(),
    );
    expect(spelled.ok).toBe(false);

    const supplied = validateThesisReport(
      reportWith({ summary: `The price needs ${breakEvenText} of decisive outcomes.` }),
      packet(),
    );
    expect(supplied.ok).toBe(true);
  });

  it("allows a percentage that an evidence item supplies", () => {
    const withRain = buildThesisPacket({
      ...calculations(),
      items: [...items, { ...items[1]!, id: "ev-rain", facts: { precipitationChancePercent: 40 } }],
      policy: packet().policy,
    });
    const result = validateThesisReport(
      reportWith({ uncertainty: "The forecast gives a 40% chance of rain at kickoff." }),
      withRain,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects altered decimal odds outside 1e-6", () => {
    const math = calculations();
    const altered = validateThesisReport(
      {
        conclusion: "pass",
        summary: "numbers changed",
        claims: [],
        assumptions: [],
        uncertainty: "none",
        missingInputs: [],
        changeConditions: [],
        decimalOdds: math.decimalOdds + 0.01,
        decisiveBreakEven: math.decisiveBreakEven,
      },
      packet(),
    );
    expect(altered.ok).toBe(false);
  });

  it("repeats the schema and the rejection reasons in the repair request", async () => {
    const math = calculations();
    let attempts = 0;
    const { provider, calls } = providerWith((call) => {
      if (call.url.endsWith("/models"))
        return new Response(catalogBody([{ id: "grok-4.7" }]), { status: 200 });
      attempts += 1;
      if (attempts === 1) {
        return chatResponse(
          JSON.stringify({ ...JSON.parse(validReportJson()), decimalOdds: math.decimalOdds + 1 }),
        );
      }
      return chatResponse(validReportJson());
    });
    const result = await provider.draftThesis({
      modelId: "grok-4.7",
      catalog: compatible,
      packet: packet(),
    });
    expect(result.draftingFailed).toBe(false);
    const repairBody = String(
      calls.filter((call) => call.url.includes("chat/completions"))[1]?.init?.body,
    );
    expect(repairBody).toContain("claims[{text,stance,evidenceIds}]");
    expect(repairBody).toContain("ev-injury");
    expect(repairBody).toMatch(/decimalOdds does not match/);
  });

  it("repairs invalid JSON once and fails closed on a second bad response", async () => {
    let attempts = 0;
    const { provider, calls } = providerWith((call) => {
      if (call.url.endsWith("/models"))
        return new Response(catalogBody([{ id: "grok-4.7" }]), { status: 200 });
      attempts += 1;
      if (attempts === 1) return chatResponse("not json");
      return chatResponse(validReportJson());
    });
    const repaired = await provider.draftThesis({
      modelId: "grok-4.7",
      catalog: compatible,
      packet: packet(),
    });
    expect(repaired.draftingFailed).toBe(false);
    expect(repaired.repairAttempted).toBe(true);
    expect(calls.filter((call) => call.url.includes("chat/completions"))).toHaveLength(2);

    let failures = 0;
    const second = providerWith((call) => {
      if (call.url.endsWith("/models"))
        return new Response(catalogBody([{ id: "grok-4.7" }]), { status: 200 });
      failures += 1;
      return chatResponse(failures === 1 ? "nope" : "still nope");
    });
    const failed = await second.provider.draftThesis({
      modelId: "grok-4.7",
      catalog: compatible,
      packet: packet(),
    });
    expect(failed.draftingFailed).toBe(true);
    expect(failed.packet.items).toEqual(packet().items);
    expect(failed.packet.decimalOdds).toBe(calculations().decimalOdds);
    expect(failed.packet.decisiveBreakEven).toBe(calculations().decisiveBreakEven);
    expect(JSON.stringify(failed)).not.toContain(FAKE_KEY);
  });

  it("surfaces auth failure, rate limit, and unknown usage cost", async () => {
    const auth = providerWith(() => new Response("unauthorized", { status: 401 }));
    const authResult = await auth.provider.draftThesis({
      modelId: "grok-4.7",
      catalog: compatible,
      packet: packet(),
    });
    expect(authResult.draftingFailed).toBe(true);
    expect(authResult.error?.kind).toBe("auth");
    expect(JSON.stringify(authResult)).not.toContain(FAKE_KEY);

    const limited = providerWith(() => new Response("slow down", { status: 429 }));
    const limitedResult = await limited.provider.draftThesis({
      modelId: "grok-4.7",
      catalog: compatible,
      packet: packet(),
    });
    expect(limitedResult.error?.kind).toBe("rate_limit");

    const noUsage = providerWith(() => chatResponse(validReportJson(), null));
    const usageResult = await noUsage.provider.draftThesis({
      modelId: "grok-4.7",
      catalog: compatible,
      packet: packet(),
    });
    expect(usageResult.draftingFailed).toBe(false);
    expect(usageResult.usage).toBeNull();
    expect(usageResult.usageCost).toBeNull();

    const costless = providerWith(() =>
      chatResponse(validReportJson(), {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      }),
    );
    const costlessResult = await costless.provider.draftThesis({
      modelId: "grok-4.7",
      catalog: compatible,
      packet: packet(),
    });
    expect(costlessResult.usage).toMatchObject({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
    expect(costlessResult.usageCost).toBeNull();
  });

  it("rejects a malformed report and keeps evidence", async () => {
    const { provider } = providerWith((call) => {
      if (call.url.endsWith("/models")) return new Response("{}", { status: 200 });
      return chatResponse("{");
    });
    // first response is invalid JSON ("{"), repair also returns "{"
    const broken = providerWith(() => chatResponse("{"));
    const result = await broken.provider.draftThesis({
      modelId: "grok-4.7",
      catalog: compatible,
      packet: packet(),
    });
    expect(result.draftingFailed).toBe(true);
    expect(result.packet.items.map((item) => item.id)).toEqual(["ev-injury", "ev-weather"]);
    void provider;
  });

  it("discovers DeepSeek models through its own base URL", async () => {
    const { fetch, calls } = mockFetch(
      () =>
        new Response(catalogBody([{ id: "deepseek-chat" }, { id: "deepseek-embed" }]), {
          status: 200,
        }),
    );
    const provider = createDeepSeekProvider({
      apiKey: FAKE_KEY,
      fetch,
      now: () => "2026-10-25T21:00:00.000Z",
    });
    const catalog = await provider.discoverModels();
    expect(calls[0]?.url).toBe("https://api.deepseek.com/models");
    expect(catalog.entries).toHaveLength(2);
    expect(catalog.retrievedAt).toBe("2026-10-25T21:00:00.000Z");
    const selection = selectThesisModel(catalog.entries, { provider: "deepseek" });
    expect(selection.entries.find((entry) => entry.id === "deepseek-embed")).toMatchObject({
      compatible: false,
      reason: "not a text thesis model",
    });
    expect(selection.preferredId).toBeNull();
  });
});
