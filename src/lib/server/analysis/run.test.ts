import { describe, expect, it } from "vite-plus/test";
import { loadFixtureGames } from "#lib/server/analysis/games.ts";
import { runAnalysis, type AnalysisRequest, type ThesisDrafter } from "#lib/server/analysis/run.ts";
import { createFixtureDrafter } from "#lib/server/analysis/fixture-drafter.ts";
import { createMemoryStore } from "#lib/server/analysis/store.ts";
import type { ThesisPacket } from "#lib/server/providers/contracts.ts";

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
