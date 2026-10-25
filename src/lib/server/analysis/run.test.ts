import { describe, expect, it } from "vite-plus/test";
import { loadFixtureGames } from "#lib/server/analysis/games.ts";
import { runAnalysis, type AnalysisRequest, type ThesisDrafter } from "#lib/server/analysis/run.ts";
import { createFixtureDrafter } from "#lib/server/analysis/fixture-drafter.ts";
import { createMemoryStore } from "#lib/server/analysis/store.ts";
import type { ThesisPacket } from "#lib/server/providers/contracts.ts";
import type { EvidenceItem } from "#lib/server/sources/contracts.ts";
import type { CollectedEvidence, EvidenceCollector } from "#lib/server/analysis/evidence.ts";

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
    // A caveat alone does not block; the unreleased model still does.
    expect(outcome.run?.policy?.blockingReason).toMatch(/unreleased/);
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
