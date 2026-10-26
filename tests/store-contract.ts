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

    it("returns the same attempt for a repeated request and rejects changed inputs", async () => {
      const store = makeStore();
      const inner = createFixtureDrafter();
      let drafts = 0;
      const drafter: ThesisDrafter = {
        ...inner,
        async draftThesis(input) {
          drafts += 1;
          return inner.draftThesis(input);
        },
      };
      const input = { ...request(), requestId: "ticket05-idempotent-request" };
      const first = await runAnalysis(input, { store, drafter });
      const repeated = await runAnalysis(input, { store, drafter });
      expect(first.ok).toBe(true);
      expect(repeated.ok).toBe(true);
      if (!first.ok || !repeated.ok) return;
      expect(repeated.run.id).toBe(first.run.id);
      expect(drafts).toBe(1);

      const conflict = await runAnalysis({ ...input, americanOdds: -105 }, { store, drafter });
      expect(conflict.ok).toBe(false);
      expect(conflict.ok ? "" : conflict.error).toMatch(/request.*different inputs/i);
      expect(drafts).toBe(1);
    });

    it("treats a changed parent relationship as conflicting request input", async () => {
      const store = makeStore();
      const input = { ...request(), requestId: "ticket05-parent-conflict" };
      const first = await runAnalysis(input, { store });
      expect(first.ok).toBe(true);
      const conflict = await runAnalysis({ ...input, parentId: "different-parent" }, { store });
      expect(conflict.ok).toBe(false);
      expect(conflict.ok ? "" : conflict.error).toMatch(/request.*different inputs/i);
    });

    it("serializes concurrent submissions with one request identifier", async () => {
      const store = makeStore();
      const inner = createFixtureDrafter();
      let drafts = 0;
      const drafter: ThesisDrafter = {
        ...inner,
        async draftThesis(input) {
          drafts += 1;
          return inner.draftThesis(input);
        },
      };
      const input = { ...request(), requestId: "ticket05-concurrent-request" };
      const [left, right] = await Promise.all([
        runAnalysis(input, { store, drafter }),
        runAnalysis(input, { store, drafter }),
      ]);
      expect(left.run?.id).toBeTruthy();
      expect(right.run?.id).toBe(left.run?.id);
      expect(drafts).toBe(1);
    });

    it("keeps an ambiguous collection attempt and never replays it automatically", async () => {
      const store = makeStore();
      const input = { ...request(), requestId: "ticket05-ambiguous-collection" };
      let collections = 0;
      const uncertain = async () => {
        collections += 1;
        throw new Error("connection closed while waiting for source response");
      };
      const first = await runAnalysis(input, { store, collect: uncertain });
      expect(first.ok).toBe(false);
      expect(first.run?.status).toBe("failed");
      expect(first.run?.stages).toContain("collecting evidence");
      expect(first.run?.request?.id).toBe(input.requestId);
      const repeated = await runAnalysis(input, { store, collect: uncertain });
      expect(repeated.run?.id).toBe(first.run?.id);
      expect(repeated.run?.status).toBe("failed");
      expect(collections).toBe(1);

      const deliberate = await runAnalysis(
        { ...input, requestId: "ticket05-deliberate-recovery" },
        { store },
      );
      expect(deliberate.run?.id).not.toBe(first.run?.id);
      expect(await store.getRun(first.run!.id)).toEqual(first.run);
    });

    it("persists pending before collection and exposes an interruption there", async () => {
      const base = makeStore();
      let collections = 0;
      const store: ResearchStore = {
        ...base,
        async beginAttempt(input) {
          const begun = await base.beginAttempt(input);
          if (begun.kind !== "created") return begun;
          const interrupted = await base.markInterrupted(begun.run.id);
          return { kind: "existing", run: interrupted! };
        },
      };
      const result = await runAnalysis(
        { ...request(), requestId: "ticket05-before-collection" },
        {
          store,
          collect: async () => {
            collections += 1;
            return { items: [], gaps: [], materialGaps: [] };
          },
        },
      );
      expect(result.ok).toBe(false);
      expect(result.run?.status).toBe("interrupted");
      expect(result.run?.stages).toEqual(["checking inputs"]);
      expect(collections).toBe(0);
    });

    it("retains progress when interrupted after provider work before finalization", async () => {
      const base = makeStore();
      const input = { ...request(), requestId: "ticket05-before-finalization" };
      const inner = createFixtureDrafter();
      let drafts = 0;
      const drafter: ThesisDrafter = {
        ...inner,
        async draftThesis(packet) {
          drafts += 1;
          return inner.draftThesis(packet);
        },
      };
      let attemptId = "";
      const crashing: ResearchStore = {
        ...base,
        async beginAttempt(newRun) {
          const begun = await base.beginAttempt(newRun);
          if (begun.kind === "created") attemptId = begun.run.id;
          return begun;
        },
        async saveRun() {
          throw new Error("simulated process stop before finalization");
        },
      };
      await expect(runAnalysis(input, { store: crashing, drafter })).rejects.toThrow(
        /simulated process stop/,
      );
      const interrupted = await base.markInterrupted(attemptId);
      expect(interrupted?.status).toBe("interrupted");
      expect(interrupted?.stages).toContain("checking report");
      expect(interrupted?.evidence.length).toBeGreaterThan(0);
      const retry = await runAnalysis(input, { store: base, drafter });
      expect(retry.run?.id).toBe(attemptId);
      expect(retry.run?.status).toBe("interrupted");
      expect(drafts).toBe(1);
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
            {
              text: "Kickoff 52F",
              url: "",
              sourceTime: "2026-10-25T14:00:00.000Z",
              covers: "weather",
            },
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
      const listed = (await store.listCompleted()).find(
        (summary) => summary.id === outcome.run!.id,
      );
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

    it("keeps the frozen forecast after later inputs change", async () => {
      const store = makeStore();
      const forecast = {
        version: 1 as const,
        provenance: "captured" as const,
        decisionCutoff: NOW,
        inputAvailability: {
          version: "decision-time-starters-v1",
          results: "strictly-before-decision-cutoff",
          starters: "known and assumed identities require evidence at or before the decision cutoff",
        },
        artifact: { checksum: "a".repeat(64), version: 4 as const },
        features: { home_qb_share: 1, away_qb_share: 0.5 },
        starters: {
          home: { state: "assumed" as const, identity: "hurts", evidenceAt: NOW },
          away: { state: "unknown" as const, identity: null, evidenceAt: null },
        },
        marketEligibility: { market: "moneyline" as const, eligible: false },
        probabilities: { win: 0.55, loss: 0.43, push: 0.02 },
        uncertainty: { available: false as const, reason: "Not assessed." },
        policyVersion: "policy-2026-10-25.2",
      };
      const first = (
        await runAnalysis(request(), { store, model: unreleasedModel, forecast: async () => forecast })
      ).run!;
      expect(first.forecast).toEqual(forecast);
      const changed = (
        await runAnalysis(
          request({
            game: { ...game, kickoff: "2026-10-26T17:00:00.000Z" },
            nowIso: "2026-10-26T16:00:00.000Z",
            parentId: first.id,
            americanOdds: 120,
          }),
          {
            store,
            model: unreleasedModel,
            forecast: async () => ({
              ...forecast,
              decisionCutoff: "2026-10-26T16:00:00.000Z",
              probabilities: { win: 0.2, loss: 0.75, push: 0.05 },
              policyVersion: "policy-later",
              starters: {
                home: { state: "known", identity: "backup", evidenceAt: "2026-10-26T15:00:00.000Z" },
                away: { state: "known", identity: "other", evidenceAt: "2026-10-26T15:00:00.000Z" },
              },
            }),
          },
        )
      ).run!;
      expect(await store.getRun(first.id)).toMatchObject({ forecast });
      expect(changed.forecast?.probabilities.win).toBe(0.2);
      expect(changed.forecast?.starters.home.identity).toBe("backup");
    });

    it("keeps a run's game and offer after the current schedule changes", async () => {
      const store = makeStore();
      const first = (await runAnalysis(request(), { store })).run!;
      const changedGame = {
        ...game,
        kickoff: "2026-10-26T17:00:00.000Z",
        venue: { ...game.venue, name: "Updated Lincoln Financial Field" },
      };
      const second = (
        await runAnalysis(
          request({
            game: changedGame,
            nowIso: "2026-10-26T16:00:00.000Z",
            scheduleRetrievedAt: "2026-10-26T12:00:00.000Z",
            parentId: first.id,
            sportsbook: "Changed Book",
            americanOdds: -105,
            observedAt: "2026-10-26T15:30:00.000Z",
          }),
          { store },
        )
      ).run!;

      expect(second.game).toMatchObject({
        kickoff: changedGame.kickoff,
        venue: changedGame.venue.name,
      });
      expect(second.snapshotProvenance).toBe("captured");
      expect(second.offer).toMatchObject({ sportsbook: "Changed Book", americanOdds: -105 });
      expect(await store.getRun(first.id)).toEqual(first);
      expect(await store.getRun(first.id)).toMatchObject({
        game: { kickoff: game.kickoff, venue: game.venue.name },
        offer: first.offer,
        evidence: first.evidence,
        report: first.report,
        lean: first.lean,
      });
      expect((await store.listCompleted()).map((run) => run.id)).toEqual(
        expect.arrayContaining([first.id, second.id]),
      );
      const listed = (await store.listCompleted()).find((item) => item.id === first.id);
      expect(listed?.game.kickoff).toBe(game.kickoff);
      expect(listed?.snapshotProvenance).toBe("captured");
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
      const recorded = await store.recordBet({
        analysisId: run.id,
        submissionId: "placement-other-book",
        sportsbook: "Other Book",
        market: "moneyline",
        selection: "home",
        americanOdds: -108,
        stakeUnits: 1.5,
        placedAt: "2026-10-25T15:55:00.000Z",
        rules: { period: "full-game", overtime: "included", tie: "push" },
      });
      expect(recorded.kind).toBe("created");
      if (recorded.kind !== "created") throw new Error("expected a created bet");
      const bet = recorded.bet;
      expect(await store.listBets()).toContainEqual(bet);
      expect(bet).toMatchObject({ sportsbook: "Other Book", americanOdds: -108, stakeUnits: 1.5 });
      expect((await store.getRun(run.id))?.status).toBe("completed");
    });

    it("stores the placed contract independently of the researched offer", async () => {
      const store = makeStore();
      const run = (
        await runAnalysis(
          request({ market: "spread", selection: "home", pointLine: -3, americanOdds: -110 }),
          { store },
        )
      ).run!;
      const recorded = await store.recordBet({
        analysisId: run.id,
        submissionId: "placement-dal-phi-1",
        sportsbook: "Other Book",
        market: "spread",
        selection: "home",
        pointLine: -3.5,
        americanOdds: -105,
        stakeUnits: 1.5,
        placedAt: "2026-10-25T15:55:00.000Z",
        rules: { period: "full-game", overtime: "included" },
      });
      expect(recorded.kind).toBe("created");
      if (recorded.kind !== "created") throw new Error("expected a created bet");
      const bet = recorded.bet;
      const saved = (await store.listBets()).find((item) => item.id === bet.id);
      expect(saved).toMatchObject({
        analysisId: run.id,
        submissionId: "placement-dal-phi-1",
        contractProvenance: "captured",
        sportsbook: "Other Book",
        market: "spread",
        selection: "home",
        pointLine: -3.5,
        americanOdds: -105,
        stakeUnits: 1.5,
        placedAt: "2026-10-25T15:55:00.000Z",
        rules: { period: "full-game", overtime: "included", tie: null },
      });
      expect((await store.getRun(run.id))?.offer).toMatchObject({
        pointLine: -3,
        americanOdds: -110,
        sportsbook: "Example Book",
      });
    });

    it("keeps one actual bet when the same submission is repeated", async () => {
      const store = makeStore();
      const run = (await runAnalysis(request(), { store })).run!;
      const input = {
        analysisId: run.id,
        submissionId: "placement-repeat",
        sportsbook: "Other Book",
        market: "moneyline" as const,
        selection: "home" as const,
        americanOdds: -108,
        stakeUnits: 1,
        placedAt: "2026-10-25T15:55:00.000Z",
        rules: { period: "full-game" as const, overtime: "included" as const, tie: "push" as const },
      };
      const [first, second] = await Promise.all([store.recordBet(input), store.recordBet(input)]);
      const bets = await store.listBets();
      expect(bets).toHaveLength(1);
      expect(first.kind === "conflict" ? null : first.bet.id).toBe(bets[0]?.id);
      expect(second.kind === "conflict" ? null : second.bet.id).toBe(bets[0]?.id);
    });

    it("conflicts when a submission identifier is reused with different terms", async () => {
      const store = makeStore();
      const run = (await runAnalysis(request(), { store })).run!;
      const first = await store.recordBet({
        analysisId: run.id,
        submissionId: "placement-conflict",
        sportsbook: "Other Book",
        market: "spread",
        selection: "home",
        pointLine: -3.5,
        americanOdds: -105,
        stakeUnits: 1,
        placedAt: "2026-10-25T15:55:00.000Z",
        rules: { period: "full-game", overtime: "included" },
      });
      const second = await store.recordBet({
        analysisId: run.id,
        submissionId: "placement-conflict",
        sportsbook: "Other Book",
        market: "spread",
        selection: "home",
        pointLine: -3,
        americanOdds: -110,
        stakeUnits: 1,
        placedAt: "2026-10-25T15:55:00.000Z",
        rules: { period: "full-game", overtime: "included" },
      });
      expect(first.kind).toBe("created");
      expect(second).toMatchObject({
        kind: "conflict",
        error: expect.stringMatching(/different inputs/i),
      });
      expect(await store.listBets()).toHaveLength(1);
      expect((await store.listBets())[0]).toMatchObject({ pointLine: -3.5, americanOdds: -105 });
    });

    it("rejects a bet for an analysis that does not exist", async () => {
      const store = makeStore();
      await expect(
        store.recordBet({
          analysisId: "00000000-0000-4000-8000-000000000000",
          submissionId: "missing-analysis",
          sportsbook: "Book",
          market: "moneyline",
          selection: "home",
          americanOdds: -110,
          stakeUnits: 1,
          placedAt: NOW,
          rules: { period: "full-game", overtime: "included", tie: "push" },
        }),
      ).rejects.toThrow(/not found/i);
    });
  });
}
