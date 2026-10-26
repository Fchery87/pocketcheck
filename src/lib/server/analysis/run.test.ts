import { describe, expect, it } from "vite-plus/test";
import { loadFixtureGames } from "#lib/server/analysis/games.ts";
import { runAnalysis, type AnalysisRequest, type ThesisDrafter } from "#lib/server/analysis/run.ts";
import { createFixtureDrafter } from "#lib/server/analysis/fixture-drafter.ts";
import { createMemoryStore } from "#lib/server/analysis/store.ts";
import type { ThesisPacket } from "#lib/server/providers/contracts.ts";
import type { EvidenceItem } from "#lib/server/sources/contracts.ts";
import type { CollectedEvidence, EvidenceCollector } from "#lib/server/analysis/evidence.ts";
import type { ModelSource } from "#lib/server/analysis/model.ts";
import type { UncertaintyAssessment } from "#lib/server/models/uncertainty.ts";

const NOW = "2026-10-25T16:00:00.000Z";
const game = loadFixtureGames("tests/fixtures/sources/games-minimized.csv", NOW).find(
  (item) => item.id === "2026_07_DAL_PHI",
)!;

function request(overrides: Partial<AnalysisRequest> = {}): AnalysisRequest {
  return {
    game,
    nowIso: NOW,
    sportsbook: "Example Book",
    market: "moneyline",
    selection: "home",
    americanOdds: -110,
    observedAt: "2026-10-25T15:30:00.000Z",
    tieRule: "push",
    ...overrides,
  };
}

function capturingDrafter(): ThesisDrafter & { packets: ThesisPacket[] } {
  const inner = createFixtureDrafter();
  const packets: ThesisPacket[] = [];
  return {
    id: inner.id,
    modelId: inner.modelId,
    packets,
    async draftThesis(input) {
      packets.push(input.packet);
      return inner.draftThesis(input);
    },
  };
}

describe("research run", () => {
  it("analyzes when the private lean names a team code or a side", async () => {
    for (const lean of ["PHI", "home", "DAL"]) {
      const outcome = await runAnalysis(request({ lean }), { store: createMemoryStore() });
      expect(outcome.ok, lean).toBe(true);
    }
  });

  it("keeps the private lean out of the packet sent to the drafter", async () => {
    const drafter = capturingDrafter();
    const sentinel = "lean-sentinel-7f3a";
    const outcome = await runAnalysis(request({ lean: sentinel, rationale: `${sentinel} why` }), {
      store: createMemoryStore(),
      drafter,
    });
    expect(outcome.ok).toBe(true);
    expect(JSON.stringify(drafter.packets)).not.toContain(sentinel);
    expect(outcome.run?.lean?.text).toBe(sentinel);
  });

  it("gives the drafter the policy conclusion and saves a report that agrees with it", async () => {
    const drafter = capturingDrafter();
    const outcome = await runAnalysis(request(), { store: createMemoryStore(), drafter });
    expect(outcome.ok).toBe(true);
    expect(drafter.packets[0]?.policy.conclusion).toBe("insufficient evidence");
    expect(outcome.run?.report?.conclusion).toBe("insufficient evidence");
    expect(outcome.run?.policy?.conclusion).toBe("insufficient evidence");
  });

  it("fails the run when the drafted conclusion overrides the policy, keeping the evidence", async () => {
    const inner = createFixtureDrafter();
    const overriding: ThesisDrafter = {
      ...inner,
      async draftThesis(input) {
        const drafted = await inner.draftThesis(input);
        return {
          ...drafted,
          report: { ...drafted.report!, conclusion: "experimental value candidate" },
        };
      },
    };
    const store = createMemoryStore();
    const outcome = await runAnalysis(request(), { store, drafter: overriding });
    expect(outcome.ok).toBe(false);
    expect(outcome.run?.status).toBe("failed");
    expect(outcome.run?.failureReason).toMatch(/disagrees with the policy/);
    expect(outcome.run?.evidence.map((item) => item.id)).toContain("schedule:2026_07_DAL_PHI");
    expect(await store.listCompleted()).toHaveLength(0);
  });

  it("records the drafter and model that produced the report", async () => {
    const outcome = await runAnalysis(request(), { store: createMemoryStore() });
    expect(outcome.run?.provider).toBe("fixture");
    expect(outcome.run?.model).toBe("fixture-drafter");
  });

  it("records unknown usage as unknown, not zero", async () => {
    const outcome = await runAnalysis(request(), { store: createMemoryStore() });
    expect(outcome.run?.usage).toBeNull();
  });

  it("saves the evidence items the report cites so they can be inspected later", async () => {
    const store = createMemoryStore();
    const outcome = await runAnalysis(request(), { store });
    const saved = await store.getRun(outcome.run!.id);
    const cited = saved?.report?.claims.flatMap((claim) => claim.evidenceIds) ?? [];
    expect(cited.length).toBeGreaterThan(0);
    for (const id of cited) {
      expect(saved?.evidence.find((item) => item.id === id)?.excerpt).toBeTruthy();
    }
  });
});

describe("research run evidence", () => {
  const injury: EvidenceItem = {
    id: "nflverse-injuries-1",
    sourceId: "nflverse-injuries",
    url: "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2026.csv",
    retrievedAt: "2026-10-25T12:00:00.000Z",
    publishedAt: "unknown",
    origin: "automatic",
    facts: { team: "PHI", player: "Saquon Barkley", reportStatus: "Questionable" },
    excerpt: null,
    checksum: null,
    factKey: "availability:PHI:Saquon Barkley",
  };
  const collector =
    (collected: Partial<CollectedEvidence>): EvidenceCollector =>
    async () => ({ items: [], gaps: [], materialGaps: [], ...collected });

  it("sends collected evidence and every gap to the drafter and saves the gaps", async () => {
    const drafter = capturingDrafter();
    const caveat = "nflverse injury rows have no publication time.";
    const outcome = await runAnalysis(request(), {
      store: createMemoryStore(),
      drafter,
      collect: collector({ items: [injury], gaps: [caveat] }),
    });
    expect(outcome.ok).toBe(true);
    expect(drafter.packets[0]?.items.map((item) => item.id)).toContain(injury.id);
    expect(drafter.packets[0]?.gaps).toContain(caveat);
    expect(outcome.run?.gaps).toContain(caveat);
    // A caveat alone does not block; the missing model still does.
    expect(outcome.run?.policy?.blockingReason).toBe("No model artifact is configured.");
  });

  it("blocks on material gaps, which the default collector reports for both sources", async () => {
    const outcome = await runAnalysis(request(), { store: createMemoryStore() });
    expect(outcome.run?.policy?.blockingReason).toBe("Material evidence is missing.");
    expect(outcome.run?.gaps).toEqual(
      expect.arrayContaining(["Injury report was not collected.", "Weather was not collected."]),
    );
  });

  it("adds manual evidence and reports one dated after the cutoff as excluded", async () => {
    const outcome = await runAnalysis(
      request({
        manualEvidence: [
          {
            text: "Club report lists Saquon Barkley as a full participant.",
            url: "https://www.philadelphiaeagles.com/news/example",
            sourceTime: "unknown",
          },
          { text: "Written tomorrow.", url: "", sourceTime: "2026-10-26T12:00:00.000Z" },
        ],
      }),
      { store: createMemoryStore(), collect: collector({}) },
    );
    expect(outcome.ok).toBe(true);
    const manual = outcome.run?.evidence.filter((item) => item.origin === "manual") ?? [];
    expect(manual.map((item) => item.excerpt)).toEqual([
      "Club report lists Saquon Barkley as a full participant.",
    ]);
    expect(manual[0]?.retrievedAt).toBe(NOW);
    expect(outcome.run?.gaps.join(" ")).toMatch(/1 evidence item dated after the decision cutoff/);
    expect(outcome.run?.gaps.join(" ")).toContain("Written tomorrow.");
  });

  it("refuses manual evidence with neither text nor a link", async () => {
    const outcome = await runAnalysis(
      request({ manualEvidence: [{ text: " ", url: "", sourceTime: "unknown" }] }),
      { store: createMemoryStore(), collect: collector({}) },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.error).toMatch(/text or url/i);
  });

  it("treats sources that disagree on a fact as missing material evidence", async () => {
    const outcome = await runAnalysis(request(), {
      store: createMemoryStore(),
      collect: collector({
        items: [
          injury,
          {
            ...injury,
            id: "club-1",
            sourceId: "club",
            facts: { ...injury.facts, reportStatus: "Out" },
          },
        ],
      }),
    });
    expect(outcome.run?.policy?.blockingReason).toBe("Material evidence is missing.");
    expect(outcome.run?.gaps.join(" ")).toMatch(/disagree on availability:PHI:Saquon Barkley/);
  });

  it("carries earlier manual evidence into a refresh", async () => {
    const outcome = await runAnalysis(
      request({
        carriedEvidence: [{ ...injury, id: "manual-9", sourceId: "manual", origin: "manual" }],
      }),
      { store: createMemoryStore(), collect: collector({}) },
    );
    expect(outcome.run?.evidence.map((item) => item.id)).toContain("manual-9");
  });
});

describe("research run model", () => {
  const quiet: EvidenceCollector = async () => ({ items: [], gaps: [], materialGaps: [] });
  const probabilities = { win: 0.6, loss: 0.38, push: 0.02 };
  const computed =
    (eligible: boolean): ModelSource =>
    async () => ({
      status: "computed",
      artifact: {
        checksum: "a".repeat(64),
        version: 2,
        trainingCutoff: "2026-03-01T00:00:00Z",
        releaseStatus: eligible ? "released-experimental" : "unreleased",
        releasedMarkets: eligible ? ["moneyline"] : [],
      },
      probabilities,
      uncertainty: {
        available: true,
        confidence: 0.9,
        probabilities: { win: 0.55, loss: 0.43, push: 0.02 },
      },
      eligible,
      reason: eligible ? "Released for moneyline." : "Unreleased artifacts are not eligible.",
    });

  it("says no model is configured when none is", async () => {
    const outcome = await runAnalysis(request(), { store: createMemoryStore(), collect: quiet });
    expect(outcome.run?.probabilityModel).toEqual({
      status: "unavailable",
      reason: "No model artifact is configured.",
    });
    expect(outcome.run?.policy?.blockingReason).toBe("No model artifact is configured.");
  });

  it("records an unreleased model's probabilities without giving them to the policy or the drafter", async () => {
    const drafter = capturingDrafter();
    const outcome = await runAnalysis(request(), {
      store: createMemoryStore(),
      collect: quiet,
      drafter,
      model: computed(false),
    });
    expect(outcome.run?.probabilityModel).toMatchObject({ status: "computed", probabilities });
    expect(outcome.run?.policy).toMatchObject({
      conclusion: "insufficient evidence",
      expectedValuePerUnit: null,
      blockingReason: "Unreleased artifacts are not eligible.",
    });
    expect(JSON.stringify(drafter.packets)).not.toContain("0.38");
  });

  it("gives a released market's probabilities to the policy", async () => {
    const outcome = await runAnalysis(request({ americanOdds: 110 }), {
      store: createMemoryStore(),
      collect: quiet,
      model: computed(true),
    });
    expect(outcome.ok).toBe(true);
    // 0.6 * 1.1 - 0.38 = 0.28 units per unit staked.
    expect(outcome.run?.policy?.expectedValuePerUnit).toBeCloseTo(0.28, 10);
    expect(outcome.run?.policy?.conclusion).toBe("experimental value candidate");
  });

  it("keeps material evidence gaps ahead of a released model", async () => {
    const outcome = await runAnalysis(request(), {
      store: createMemoryStore(),
      model: computed(true),
    });
    expect(outcome.run?.policy?.blockingReason).toBe("Material evidence is missing.");
  });

  it("records a model failure as unavailable instead of failing the run", async () => {
    const outcome = await runAnalysis(request(), {
      store: createMemoryStore(),
      collect: quiet,
      model: async () => {
        throw new Error("artifact unreadable");
      },
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.run?.probabilityModel).toEqual({
      status: "unavailable",
      reason: "The model could not price this offer: artifact unreadable",
    });
  });
});

describe("value policy with uncertainty", () => {
  const quiet: EvidenceCollector = async () => ({ items: [], gaps: [], materialGaps: [] });
  const point = { win: 0.6, loss: 0.38, push: 0.02 };
  const released =
    (uncertainty: UncertaintyAssessment): ModelSource =>
    async () => ({
      status: "computed",
      artifact: {
        checksum: "b".repeat(64),
        version: 4,
        trainingCutoff: "2026-03-01T00:00:00Z",
        releaseStatus: "released-experimental",
        releasedMarkets: ["moneyline"],
      },
      probabilities: point,
      uncertainty,
      eligible: true,
      reason: "Released for moneyline.",
    });
  const sure = (win: number, loss: number): UncertaintyAssessment => ({
    available: true,
    confidence: 0.9,
    probabilities: { win, loss, push: 0.02 },
  });
  const run = (model: ModelSource, americanOdds = 110) =>
    runAnalysis(request({ americanOdds }), { store: createMemoryStore(), collect: quiet, model });

  it("calls a market a candidate only when the conservative estimate clears the threshold", async () => {
    const outcome = await run(released(sure(0.5, 0.48)));
    const policy = outcome.run!.policy!;
    expect(policy.policyVersion).toBe("policy-2026-10-25.2");
    expect(policy.conclusion).toBe("experimental value candidate");
    expect(policy.expectedValuePerUnit).toBeCloseTo(0.6 * 1.1 - 0.38, 10);
    expect(policy.conservativeExpectedValuePerUnit).toBeCloseTo(0.5 * 1.1 - 0.48, 10);
    expect(policy.threshold).toEqual({
      version: "threshold-2026-10-25",
      conservativeExpectedValue: 0,
    });
    expect(policy.priceCutoff).toMatchObject({ available: true, decimalMinimum: 1 + 0.48 / 0.5 });
  });

  it("leans, not recommends, when only the point estimate is positive", async () => {
    const policy = (await run(released(sure(0.45, 0.53)))).run!.policy!;
    expect(policy.conclusion).toBe("experimental lean");
    expect(policy.blockingReason).toMatch(/conservative estimate at 90% confidence is -0\.0350/);
  });

  it("reports insufficient evidence when uncertainty cannot be assessed", async () => {
    const policy = (
      await run(released({ available: false, reason: "Training produced 12 forecasts." }))
    ).run!.policy!;
    expect(policy.conclusion).toBe("insufficient evidence");
    expect(policy.blockingReason).toBe(
      "Uncertainty assessment unavailable: Training produced 12 forecasts.",
    );
    expect(policy.conservativeExpectedValuePerUnit).toBeNull();
  });

  it("passes when the price leaves no positive expected value", async () => {
    const policy = (await run(released(sure(0.5, 0.48)), -200)).run!.policy!;
    expect(policy.conclusion).toBe("pass");
    expect(policy.expectedValuePerUnit).toBeCloseTo(0.6 * 0.5 - 0.38, 10);
  });

  it("does not assess uncertainty for an ineligible model", async () => {
    const ineligible: ModelSource = async (...args) =>
      ({
        ...(await released(sure(0.5, 0.48))(...args)),
        eligible: false,
        reason: "Unreleased artifacts are not eligible.",
      }) as Awaited<ReturnType<ModelSource>>;
    const policy = (await run(ineligible)).run!.policy!;
    expect(policy.conclusion).toBe("insufficient evidence");
    expect(policy.uncertainty).toEqual({ available: false, reason: "Not assessed." });
  });
});

describe("manual evidence standing in for a missing source", () => {
  const missingBoth: EvidenceCollector = async () => ({
    items: [],
    gaps: ["Injury report was not collected.", "Weather was not collected."],
    materialGaps: [
      { kind: "injury-report", text: "Injury report was not collected." },
      { kind: "weather", text: "Weather was not collected." },
    ],
  });
  const hoursBefore = (hours: number) =>
    new Date(Date.parse(NOW) - hours * 3_600_000).toISOString();
  const entry = (covers: "injury-report" | "weather" | undefined, sourceTime: string) => ({
    text: covers === "weather" ? "Kickoff 52F, wind 8 mph, 10% rain" : "PHI: no starters out",
    url: "",
    sourceTime,
    ...(covers ? { covers } : {}),
  });
  const analyze = (
    manualEvidence: ReturnType<typeof entry>[],
    extra: Partial<AnalysisRequest> = {},
  ) =>
    runAnalysis(request({ manualEvidence, ...extra }), {
      store: createMemoryStore(),
      collect: missingBoth,
    });

  it("clears each gap that fresh, tagged manual evidence covers, and says the run relies on it", async () => {
    const outcome = await analyze([
      entry("injury-report", hoursBefore(3)),
      entry("weather", hoursBefore(2)),
    ]);
    const policy = outcome.run!.policy!;
    expect(policy.blockingReason).not.toBe("Material evidence is missing.");
    expect(policy.reliesOnManualEvidence).toBe(true);
    expect(policy.manualCoverage.map((coverage) => coverage.kind).sort()).toEqual([
      "injury-report",
      "weather",
    ]);
    expect(outcome.run!.gaps.join(" ")).toMatch(/injury report comes from manual evidence/);
  });

  it("keeps the gap when the tagged evidence is too old, and says why", async () => {
    const outcome = await analyze([
      entry("injury-report", hoursBefore(30)),
      entry("weather", hoursBefore(2)),
    ]);
    expect(outcome.run!.policy!.blockingReason).toBe("Material evidence is missing.");
    expect(outcome.run!.gaps.join(" ")).toMatch(
      /30 hours old; the injury report needs one from the last 24 hours/,
    );
  });

  it("keeps the gap for untagged evidence or evidence without a source time", async () => {
    const untagged = await analyze([
      entry(undefined, hoursBefore(1)),
      entry("weather", hoursBefore(1)),
    ]);
    expect(untagged.run!.policy!.blockingReason).toBe("Material evidence is missing.");
    const undated = await analyze([
      entry("injury-report", "unknown"),
      entry("weather", hoursBefore(1)),
    ]);
    expect(undated.run!.gaps.join(" ")).toMatch(/has no source time, so it cannot stand in/);
    expect(undated.run!.policy!.reliesOnManualEvidence).toBe(true);
  });

  it("re-checks carried evidence against the refresh's own cutoff", async () => {
    const parent = (
      await analyze([entry("injury-report", hoursBefore(20)), entry("weather", hoursBefore(1))])
    ).run!;
    const later = new Date(Date.parse(NOW) + 6 * 3_600_000).toISOString();
    const refreshed = await runAnalysis(
      request({
        nowIso: later,
        observedAt: later,
        parentId: parent.id,
        carriedEvidence: parent.evidence.filter((item) => item.origin === "manual"),
      }),
      { store: createMemoryStore(), collect: missingBoth },
    );
    expect(refreshed.run!.policy!.manualCoverage.map((coverage) => coverage.kind)).toEqual([
      "weather",
    ]);
    expect(refreshed.run!.policy!.blockingReason).toBe("Material evidence is missing.");
  });

  it("accepts evidence exactly at the freshness limit and ignores a source time after the cutoff", async () => {
    const exact = await analyze([entry("weather", hoursBefore(12))]);
    expect(exact.run!.policy!.manualCoverage.map((coverage) => coverage.kind)).toEqual(["weather"]);
    const future = await analyze([entry("weather", hoursBefore(-1))]);
    expect(future.run!.policy!.manualCoverage).toEqual([]);
    expect(future.run!.policy!.blockingReason).toBe("Material evidence is missing.");
    expect(future.run!.gaps.join(" ")).not.toMatch(/hours old/);
  });
});
