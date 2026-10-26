import { describe, expect, it } from "vite-plus/test";
import { loadFixtureGames } from "#lib/server/analysis/games.ts";
import { createFixtureDrafter } from "#lib/server/analysis/fixture-drafter.ts";
import { runAnalysis, type AnalysisRequest, type ThesisDrafter } from "#lib/server/analysis/run.ts";
import type { ModelSource } from "#lib/server/analysis/model.ts";
import type { ResearchStore } from "#lib/server/analysis/store.ts";

const NOW = "2026-10-25T16:00:00.000Z";
const game = loadFixtureGames("tests/fixtures/sources/games-minimized.csv", NOW).find(
  (item) => item.id === "2026_07_DAL_PHI",
)!;

function request(overrides: Partial<AnalysisRequest> = {}): AnalysisRequest {
  return {
    game,
    nowIso: NOW,
    scheduleRetrievedAt: "2026-10-25T12:00:00.000Z",
    sportsbook: "Example Book",
    market: "moneyline",
    selection: "home",
    americanOdds: -110,
    observedAt: "2026-10-25T15:30:00.000Z",
    tieRule: "push",
    lean: "PHI",
    rationale: "Home rest edge",
    ...overrides,
  };
}

const overridingDrafter: ThesisDrafter = (() => {
  const inner = createFixtureDrafter();
  return {
    ...inner,
    async draftThesis(input) {
      const drafted = await inner.draftThesis(input);
      return {
        ...drafted,
        report: { ...drafted.report!, conclusion: "experimental value candidate" },
      };
    },
  };
})();

const meteredDrafter: ThesisDrafter = (() => {
  const inner = createFixtureDrafter();
  return {
    ...inner,
    async draftThesis(input) {
      return {
        ...(await inner.draftThesis(input)),
        usage: { promptTokens: 2844, completionTokens: 167, totalTokens: 3011 },
        usageCost: 0.00168708,
      };
    },
  };
})();

const unreleasedModel: ModelSource = async () => ({
  status: "computed",
  artifact: {
    checksum: "c".repeat(64),
    version: 2,
    trainingCutoff: "2026-03-01T00:00:00.000Z",
    releaseStatus: "unreleased",
    releasedMarkets: [],
  },
  probabilities: { win: 0.55, loss: 0.43, push: 0.02 },
  uncertainty: { available: false, reason: "test" },
  eligible: false,
  reason: "Unreleased artifacts are not eligible for a value recommendation.",
});

/** Behaviour every research store must share. Run against memory and against Neon. */
export function describeStoreContract(name: string, makeStore: () => ResearchStore) {
  describe(`${name} research store`, () => {
    it("returns a saved run exactly as it was saved", async () => {
      const store = makeStore();
      const outcome = await runAnalysis(request(), { store });
      expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
      expect(await store.getRun(outcome.run!.id)).toEqual(outcome.run);
    });

    it("keeps the probability model the run froze", async () => {
      const store = makeStore();
      const outcome = await runAnalysis(request(), { store, model: unreleasedModel });
      const saved = await store.getRun(outcome.run!.id);
      expect(saved?.probabilityModel).toEqual(await unreleasedModel(game, NOW, outcome.run!.offer));
      expect(saved).toEqual(outcome.run);
    });

    it("labels a journal entry that relies on manual evidence", async () => {
      const store = makeStore();
      const outcome = await runAnalysis(
        request({
          manualEvidence: [
            { text: "Kickoff 52F", url: "", sourceTime: "2026-10-25T14:00:00.000Z", covers: "weather" },
          ],
        }),
        {
          store,
          collect: async () => ({
            items: [],
            gaps: ["Weather was not collected."],
            materialGaps: [{ kind: "weather", text: "Weather was not collected." }],
          }),
        },
      );
      const listed = (await store.listCompleted()).find((summary) => summary.id === outcome.run!.id);
      expect(listed?.reliesOnManualEvidence).toBe(true);
    });

    it("keeps the drafter's reported usage and cost", async () => {
      const store = makeStore();
      const outcome = await runAnalysis(request(), { store, drafter: meteredDrafter });
      const saved = await store.getRun(outcome.run!.id);
      expect(saved?.usage).toEqual({
        promptTokens: 2844,
        completionTokens: 167,
        totalTokens: 3011,
        costUsd: 0.00168708,
      });
    });

    it("keeps a refreshed run linked to an unchanged parent", async () => {
      const store = makeStore();
      const parent = (await runAnalysis(request(), { store })).run!;
      const child = await runAnalysis(
        request({
          americanOdds: -105,
          observedAt: "2026-10-25T15:50:00.000Z",
          parentId: parent.id,
        }),
        { store },
      );
      expect(child.run?.parentId).toBe(parent.id);
      expect(child.run?.offer.observedAt).toBe("2026-10-25T15:50:00.000Z");
      expect(await store.getRun(parent.id)).toEqual(parent);
      const completed = (await store.listCompleted()).map((run) => run.id);
      expect(completed).toEqual(expect.arrayContaining([parent.id, child.run!.id]));
    });

    it("keeps a failed run readable with its evidence but out of the completed list", async () => {
      const store = makeStore();
      const outcome = await runAnalysis(request(), { store, drafter: overridingDrafter });
      const failed = await store.getRun(outcome.run!.id);
      expect(failed?.status).toBe("failed");
      expect(failed?.evidence.map((item) => item.id)).toContain(`schedule:${game.id}`);
      expect((await store.listCompleted()).map((run) => run.id)).not.toContain(failed?.id);
    });

    it("leaves an unfinished run interrupted until a new retry is saved", async () => {
      const store = makeStore();
      const failed = (await runAnalysis(request(), { store, drafter: overridingDrafter })).run!;
      expect((await store.markInterrupted(failed.id))?.status).toBe("interrupted");
      const retry = (await runAnalysis(request({ parentId: failed.id }), { store })).run!;
      expect((await store.getRun(failed.id))?.status).toBe("interrupted");
      expect(retry.parentId).toBe(failed.id);
      expect((await store.markInterrupted(retry.id))?.status).toBe("completed");
    });

    it("records an actual bet against an analysis, separate from the assessment", async () => {
      const store = makeStore();
      const run = (await runAnalysis(request(), { store })).run!;
      const bet = await store.recordBet({
        analysisId: run.id,
        sportsbook: "Other Book",
        americanOdds: -108,
        stakeUnits: 1.5,
        placedAt: "2026-10-25T15:55:00.000Z",
      });
      expect(await store.listBets()).toContainEqual(bet);
      expect(bet).toMatchObject({ sportsbook: "Other Book", americanOdds: -108, stakeUnits: 1.5 });
      expect((await store.getRun(run.id))?.status).toBe("completed");
    });

    it("rejects a bet for an analysis that does not exist", async () => {
      const store = makeStore();
      await expect(
        store.recordBet({
          analysisId: "00000000-0000-4000-8000-000000000000",
          sportsbook: "Book",
          americanOdds: -110,
          stakeUnits: 1,
          placedAt: NOW,
        }),
      ).rejects.toThrow(/not found/i);
    });
  });
}
