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
        partial: false,
      });
    });

    it("persists both metered responses and totals them before publishing the report", async () => {
      const store = makeStore();
      const inner = createFixtureDrafter();
      const drafter: ThesisDrafter = {
        ...inner,
        async draftThesis(input) {
          const drafted = await inner.draftThesis(input);
          return {
            ...drafted,
            repairAttempted: true,
            providerRequests: [
              {
                requestId: "draft-1",
                role: "draft",
                outcome: "completed",
                response: { conclusion: "malformed" },
                promptTokens: 100,
                completionTokens: 20,
                totalTokens: 120,
                costUsd: 0.01,
                costKnown: true,
              },
              {
                requestId: "repair-1",
                role: "repair",
                outcome: "completed",
                response: drafted.report,
                promptTokens: 40,
                completionTokens: 10,
                totalTokens: null,
                costUsd: null,
                costKnown: false,
              },
            ],
          };
        },
      };
      const outcome = await runAnalysis(
        { ...request(), requestId: "ticket06-two-metered" },
        { store, drafter },
      );
      expect(outcome.ok).toBe(true);
      const saved = await store.getRun(outcome.run!.id);
      expect(saved?.providerRequests?.map((item) => item.requestId)).toEqual([
        "draft-1",
        "repair-1",
      ]);
      expect(saved?.usage).toEqual({
        promptTokens: 140,
        completionTokens: 30,
        totalTokens: null,
        costUsd: null,
        partial: true,
      });
    });

    it("keeps first-request accounting when the repair request fails in transit", async () => {
      const store = makeStore();
      const drafter: ThesisDrafter = {
        id: "fixture",
        modelId: "fixture-drafter",
        async draftThesis() {
          return {
            draftingFailed: true,
            repairAttempted: true,
            refusal: null,
            error: { kind: "transport", status: null, message: "repair connection reset" },
            report: null,
            packet: {
              items: [],
              gaps: [],
              decimalOdds: 1.9,
              decisiveBreakEven: 1 / 1.9,
              policy: { version: "policy-test", conclusion: "pass", blockingReason: null },
            },
            usage: null,
            usageCost: null,
            modelId: "fixture-drafter",
            providerRequests: [
              {
                requestId: "draft-kept",
                role: "draft",
                outcome: "completed",
                response: { conclusion: "malformed" },
                promptTokens: 80,
                completionTokens: 20,
                totalTokens: 100,
                costUsd: 0.02,
                costKnown: true,
              },
              {
                requestId: "repair-lost",
                role: "repair",
                outcome: "failed",
                response: null,
                promptTokens: null,
                completionTokens: null,
                totalTokens: null,
                costUsd: null,
                costKnown: false,
              },
            ],
          };
        },
      };
      const outcome = await runAnalysis(
        { ...request(), requestId: "ticket06-repair-transport" },
        { store, drafter },
      );
      expect(outcome.ok).toBe(false);
      const saved = await store.getRun(outcome.run!.id);
      expect(saved?.providerRequests?.map((item) => item.requestId)).toEqual([
        "draft-kept",
        "repair-lost",
      ]);
      expect(saved?.usage).toEqual({
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        costUsd: null,
        partial: true,
      });
      expect(saved?.usage?.costUsd).not.toBe(0);
    });

    it("finalizes from the durable response after a write failure without another provider request", async () => {
      const base = makeStore();
      const input = { ...request(), requestId: "ticket06-finalize-retry" };
      const inner = createFixtureDrafter();
      let drafts = 0;
      const drafter: ThesisDrafter = {
        ...inner,
        async draftThesis(packet) {
          drafts += 1;
          const drafted = await inner.draftThesis(packet);
          return {
            ...drafted,
            providerRequests: [
              {
                requestId: "durable-draft",
                role: "draft" as const,
                outcome: "completed" as const,
                response: drafted.report,
                promptTokens: 10,
                completionTokens: 5,
                totalTokens: 15,
                costUsd: 0.004,
                costKnown: true,
              },
            ],
          };
        },
      };
      let writes = 0;
      let attemptId = "";
      const flaky: ResearchStore = {
        ...base,
        async beginAttempt(run) {
          const begun = await base.beginAttempt(run);
          if (begun.kind === "created") attemptId = begun.run.id;
          return begun;
        },
        async saveRun(run) {
          writes += 1;
          if (writes === 1) throw new Error("final database write failed");
          return base.saveRun(run);
        },
      };
      await expect(runAnalysis(input, { store: flaky, drafter })).rejects.toThrow(
        /final database write failed/,
      );
      const persisted = await base.getRun(attemptId);
      expect(persisted?.status).toBe("running");
      expect(persisted?.report).toBeNull();
      expect(persisted?.providerRequests?.[0]?.requestId).toBe("durable-draft");
      const readable = await runAnalysis(input, { store: base, drafter });
      expect(readable.ok).toBe(true);
      expect(drafts).toBe(1);
      expect(readable.run?.id).toBe(attemptId);
      expect(readable.run?.providerRequests?.[0]?.requestId).toBe("durable-draft");
      expect(readable.run?.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        costUsd: 0.004,
        partial: false,
      });
    });

    it("names an ambiguous provider outcome and refuses another automatic request", async () => {
      const base = makeStore();
      const input = { ...request(), requestId: "ticket06-ambiguous-provider" };
      let drafts = 0;
      const drafter: ThesisDrafter = {
        id: "fixture",
        modelId: "fixture-drafter",
        async draftThesis() {
          drafts += 1;
          if (drafts > 1) throw new Error("a second provider request was sent");
          return {
            draftingFailed: true,
            repairAttempted: false,
            refusal: null,
            error: { kind: "timeout", status: null, message: "draft timed out after the request was sent" },
            report: null,
            packet: {
              items: [],
              gaps: [],
              decimalOdds: 1.9,
              decisiveBreakEven: 1 / 1.9,
              policy: { version: "policy-test", conclusion: "pass", blockingReason: null },
            },
            usage: null,
            usageCost: null,
            modelId: "fixture-drafter",
            providerRequests: [
              {
                requestId: "maybe-charged",
                role: "draft",
                outcome: "ambiguous",
                response: null,
                promptTokens: null,
                completionTokens: null,
                totalTokens: null,
                costUsd: null,
                costKnown: false,
              },
            ],
          };
        },
      };
      const first = await runAnalysis(input, { store: base, drafter });
      expect(first.ok).toBe(false);
      expect(first.run?.providerOutcomeAmbiguous).toBe(true);
      expect(first.run?.failureReason).toMatch(/ambiguous/i);
      expect(first.run?.failureReason).toMatch(/new attempt/i);
      const repeated = await runAnalysis(input, { store: base, drafter });
      expect(repeated.run?.id).toBe(first.run?.id);
      expect(repeated.ok).toBe(false);
      expect(repeated.ok ? "" : repeated.error).toMatch(/ambiguous/i);
      expect(drafts).toBe(1);
      const deliberate = await runAnalysis(
        { ...input, requestId: "ticket06-deliberate-after-ambiguous" },
        { store: base, drafter: createFixtureDrafter() },
      );
      expect(deliberate.ok).toBe(true);
      expect(deliberate.run?.id).not.toBe(first.run?.id);
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
