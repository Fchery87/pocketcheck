import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { loadFixtureGames } from "#lib/server/analysis/games.ts";
import { createFixtureDrafter } from "#lib/server/analysis/fixture-drafter.ts";
import { runAnalysis, type AnalysisRequest, type ThesisDrafter } from "#lib/server/analysis/run.ts";
import type { ModelSource } from "#lib/server/analysis/model.ts";
import type { ResearchStore } from "#lib/server/analysis/store.ts";

const NOW = "2026-10-25T16:00:00.000Z";
const game = loadFixtureGames("tests/fixtures/sources/games-minimized.csv", NOW).find(
  (item) => item.id === "2026_07_DAL_PHI",
)!;

function buildRequest(
  overrides: Partial<AnalysisRequest> = {},
  scope = "",
): AnalysisRequest {
  const id = overrides.requestId ?? "default";
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
    requestId: scope ? `${scope}:${id}` : id,
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
export function describeStoreContract(
  name: string,
  makeStore: () => ResearchStore | Promise<ResearchStore>,
  isolate?: { beforeEach?: () => Promise<void>; afterEach?: () => Promise<void> },
) {
  const scopeOf = () => `${name}:${expect.getState().currentTestName ?? "case"}`;
  const ask = (overrides: Partial<AnalysisRequest> = {}) => buildRequest(overrides, scopeOf());
  const submission = (id: string) => `${scopeOf()}:${id}`;
  describe(`${name} research store`, () => {
    if (isolate?.beforeEach) beforeEach(isolate.beforeEach);
    if (isolate?.afterEach) afterEach(isolate.afterEach);
    it("returns a saved run exactly as it was saved", async () => {
      const store = await makeStore();
      const outcome = await runAnalysis(ask(), { store });
      expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
      expect(await store.getRun(outcome.run!.id)).toEqual(outcome.run);
    });

    it("returns the same attempt for a repeated request and rejects changed inputs", async () => {
      const store = await makeStore();
      const inner = createFixtureDrafter();
      let drafts = 0;
      const drafter: ThesisDrafter = {
        ...inner,
        async draftThesis(input) {
          drafts += 1;
          return inner.draftThesis(input);
        },
      };
      const input = { ...ask(), requestId: `${scopeOf()}:ticket05-idempotent-request` };
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
      const store = await makeStore();
      const input = { ...ask(), requestId: `${scopeOf()}:ticket05-parent-conflict` };
      const first = await runAnalysis(input, { store });
      expect(first.ok).toBe(true);
      const conflict = await runAnalysis({ ...input, parentId: "different-parent" }, { store });
      expect(conflict.ok).toBe(false);
      expect(conflict.ok ? "" : conflict.error).toMatch(/request.*different inputs/i);
    });

    it("serializes concurrent submissions with one request identifier", async () => {
      const store = await makeStore();
      const inner = createFixtureDrafter();
      let drafts = 0;
      const drafter: ThesisDrafter = {
        ...inner,
        async draftThesis(input) {
          drafts += 1;
          return inner.draftThesis(input);
        },
      };
      const input = { ...ask(), requestId: `${scopeOf()}:ticket05-concurrent-request` };
      const [left, right] = await Promise.all([
        runAnalysis(input, { store, drafter }),
        runAnalysis(input, { store, drafter }),
      ]);
      expect(left.run?.id).toBeTruthy();
      expect(right.run?.id).toBe(left.run?.id);
      expect(drafts).toBe(1);
    });

    it("keeps an ambiguous collection attempt and never replays it automatically", async () => {
      const store = await makeStore();
      const input = { ...ask(), requestId: `${scopeOf()}:ticket05-ambiguous-collection` };
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
        { ...input, requestId: `${scopeOf()}:ticket05-deliberate-recovery` },
        { store },
      );
      expect(deliberate.run?.id).not.toBe(first.run?.id);
      expect(await store.getRun(first.run!.id)).toEqual(first.run);
    });

    it("persists pending before collection and exposes an interruption there", async () => {
      const base = await makeStore();
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
        { ...ask(), requestId: `${scopeOf()}:ticket05-before-collection` },
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
      const base = await makeStore();
      const input = { ...ask(), requestId: `${scopeOf()}:ticket05-before-finalization` };
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
      const store = await makeStore();
      const outcome = await runAnalysis(ask(), { store, model: unreleasedModel });
      const saved = await store.getRun(outcome.run!.id);
      expect(saved?.probabilityModel).toEqual(await unreleasedModel(game, NOW, outcome.run!.offer));
      expect(saved).toEqual(outcome.run);
    });

    it("labels a journal entry that relies on manual evidence", async () => {
      const store = await makeStore();
      const outcome = await runAnalysis(
        ask({
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
      const store = await makeStore();
      const outcome = await runAnalysis(ask(), { store, drafter: meteredDrafter });
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
      const store = await makeStore();
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
        { ...ask(), requestId: `${scopeOf()}:ticket06-two-metered` },
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
      const store = await makeStore();
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
        { ...ask(), requestId: `${scopeOf()}:ticket06-repair-transport` },
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
      const base = await makeStore();
      const input = { ...ask(), requestId: `${scopeOf()}:ticket06-finalize-retry` };
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
      expect(["running", "interrupted"]).toContain(persisted?.status);
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
      const base = await makeStore();
      const input = { ...ask(), requestId: `${scopeOf()}:ticket06-ambiguous-provider` };
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
        { ...input, requestId: `${scopeOf()}:ticket06-deliberate-after-ambiguous` },
        { store: base, drafter: createFixtureDrafter() },
      );
      expect(deliberate.ok).toBe(true);
      expect(deliberate.run?.id).not.toBe(first.run?.id);
    });

    it("keeps a refreshed run linked to an unchanged parent", async () => {
      const store = await makeStore();
      const parent = (await runAnalysis(ask(), { store })).run!;
      const child = await runAnalysis(
        ask({
          requestId: "refresh-child",
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
      const store = await makeStore();
      const forecast = {
        version: 1 as const,
        provenance: "captured" as const,
        decisionCutoff: NOW,
        inputAvailability: {
          version: "decision-time-starters-v1",
          results: "strictly-before-decision-cutoff",
          starters:
            "known and assumed identities require evidence at or before the decision cutoff",
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
        await runAnalysis(ask(), {
          store,
          model: unreleasedModel,
          forecast: async () => forecast,
        })
      ).run!;
      expect(first.forecast).toEqual(forecast);
      const changed = (
        await runAnalysis(
          ask({
            requestId: "forecast-replay",
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
                home: {
                  state: "known",
                  identity: "backup",
                  evidenceAt: "2026-10-26T15:00:00.000Z",
                },
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
      const store = await makeStore();
      const first = (await runAnalysis(ask(), { store })).run!;
      const changedGame = {
        ...game,
        kickoff: "2026-10-26T17:00:00.000Z",
        venue: { ...game.venue, name: "Updated Lincoln Financial Field" },
      };
      const second = (
        await runAnalysis(
          ask({
            requestId: "schedule-child",
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
      const store = await makeStore();
      const outcome = await runAnalysis(ask(), { store, drafter: overridingDrafter });
      const failed = await store.getRun(outcome.run!.id);
      expect(failed?.status).toBe("failed");
      expect(failed?.evidence.map((item) => item.id)).toContain(`schedule:${game.id}`);
      expect((await store.listCompleted()).map((run) => run.id)).not.toContain(failed?.id);
    });

    it("leaves an unfinished run interrupted until a new retry is saved", async () => {
      const store = await makeStore();
      const failed = (await runAnalysis(ask(), { store, drafter: overridingDrafter })).run!;
      const afterNotice = await store.markInterrupted(failed.id);
      expect(["failed", "interrupted"]).toContain(afterNotice?.status);
      const retry = (await runAnalysis(ask({ requestId: "retry", parentId: failed.id }), { store }))
        .run!;
      expect(["failed", "interrupted"]).toContain((await store.getRun(failed.id))?.status);
      expect(retry.parentId).toBe(failed.id);
      expect(retry.status).toBe("completed");
    });

    it("records an actual bet against an analysis, separate from the assessment", async () => {
      const store = await makeStore();
      const run = (await runAnalysis(ask(), { store })).run!;
      const recorded = await store.recordBet({
        analysisId: run.id,
        submissionId: submission("placement-other-book"),
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

    it("freezes the earliest completed pregame analysis as primary and keeps later refreshes", async () => {
      const store = await makeStore();
      const first = (await runAnalysis(ask({ requestId: "primary-first" }), { store })).run!;
      const refresh = (
        await runAnalysis(
          ask({
            requestId: "primary-refresh",
            parentId: first.id,
            americanOdds: -105,
            observedAt: "2026-10-25T15:40:00.000Z",
          }),
          { store },
        )
      ).run!;
      const failed = (
        await runAnalysis(ask({ requestId: "primary-failed" }), {
          store,
          drafter: overridingDrafter,
        })
      ).run!;

      const listed = await store.listCompleted();
      const roleOf = (id: string) => listed.find((item) => item.id === id)?.assessmentRole;
      expect(roleOf(first.id)).toEqual({
        role: "primary",
        reason: "Earliest completed analysis before kickoff",
      });
      expect(roleOf(refresh.id)).toEqual({
        role: "refresh",
        primaryId: first.id,
        reason: "Later completed analysis. The primary assessment is unchanged.",
      });
      expect(listed.map((item) => item.id)).toEqual(expect.arrayContaining([first.id, refresh.id]));
      expect(listed.map((item) => item.id)).not.toContain(failed.id);
      expect((await store.getRun(failed.id))?.status).toBe("failed");

      const again = (
        await runAnalysis(
          ask({
            requestId: "primary-later",
            parentId: refresh.id,
            americanOdds: -102,
            observedAt: "2026-10-25T15:45:00.000Z",
          }),
          { store },
        )
      ).run!;
      const afterRefresh = await store.listCompleted();
      expect(afterRefresh.find((item) => item.id === first.id)?.assessmentRole).toEqual({
        role: "primary",
        reason: "Earliest completed analysis before kickoff",
      });
      expect(afterRefresh.find((item) => item.id === again.id)?.assessmentRole.role).toBe(
        "refresh",
      );
    });

    it("keeps one primary when two eligible analyses finish together and ignores a later score", async () => {
      const store = await makeStore();
      const [left, right] = await Promise.all([
        runAnalysis(ask({ requestId: "primary-tie-a", sportsbook: "Book A" }), { store }),
        runAnalysis(ask({ requestId: "primary-tie-b", sportsbook: "Book B" }), { store }),
      ]);
      expect(left.ok && right.ok).toBe(true);
      if (!left.ok || !right.ok) return;
      const roles = (await store.listCompleted())
        .filter((item) => item.id === left.run.id || item.id === right.run.id)
        .map((item) => item.assessmentRole.role)
        .sort();
      expect(roles).toEqual(["primary", "refresh"]);
      const primaryId = (await store.listCompleted()).find(
        (item) => item.assessmentRole.role === "primary",
      )?.id;
      await store.recordBet({
        analysisId: left.run.id,
        submissionId: submission("primary-tie-bet"),
        sportsbook: "Book",
        market: "moneyline",
        selection: "home",
        americanOdds: -110,
        stakeUnits: 1,
        placedAt: NOW,
        rules: { period: "full-game", overtime: "included", tie: "push" },
      });
      expect(
        (await store.listCompleted()).find((item) => item.id === primaryId)?.assessmentRole.role,
      ).toBe("primary");
    });

    it("refuses an analysis at or after kickoff before it can become primary", async () => {
      const store = await makeStore();
      const primary = (await runAnalysis(ask({ requestId: "before-kickoff" }), { store })).run!;
      const lateOutcome = await runAnalysis(
        ask({
          requestId: "after-cutoff",
          parentId: primary.id,
          nowIso: "2026-10-27T00:15:00.001Z",
          observedAt: "2026-10-25T15:50:00.000Z",
        }),
        { store },
      );
      expect(lateOutcome.ok).toBe(false);
      expect(lateOutcome.ok ? "" : lateOutcome.error).toMatch(/already started/i);
      expect((await store.listCompleted()).map((item) => item.assessmentRole.role)).toEqual([
        "primary",
      ]);
      expect((await store.getRun(primary.id))?.assessmentRole?.role).toBe("primary");
    });

    it("labels a completed analysis without a frozen role as unclassified", async () => {
      const store = await makeStore();
      const saved = (await runAnalysis(ask({ requestId: "legacy-role" }), { store })).run!;
      if (!store.recordUnclassifiedCompleted) return;
      await store.recordUnclassifiedCompleted(saved);
      expect(
        (await store.listCompleted()).find((item) => item.id === saved.id)?.assessmentRole,
      ).toEqual({
        role: "unclassified",
        reason:
          "Completion time was not recorded, so this analysis was not classified before outcomes.",
      });
    });

    it("stores the placed contract independently of the researched offer", async () => {
      const store = await makeStore();
      const run = (
        await runAnalysis(
          ask({ market: "spread", selection: "home", pointLine: -3, americanOdds: -110 }),
          { store },
        )
      ).run!;
      const recorded = await store.recordBet({
        analysisId: run.id,
        submissionId: submission("placement-dal-phi-1"),
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
        submissionId: submission("placement-dal-phi-1"),
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
      const store = await makeStore();
      const run = (await runAnalysis(ask(), { store })).run!;
      const input = {
        analysisId: run.id,
        submissionId: submission("placement-repeat"),
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
      const store = await makeStore();
      const run = (await runAnalysis(ask(), { store })).run!;
      const first = await store.recordBet({
        analysisId: run.id,
        submissionId: submission("placement-conflict"),
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
        submissionId: submission("placement-conflict"),
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

    it("records a closing observation and reads the price comparison back", async () => {
      const store = await makeStore();
      const run = (
        await runAnalysis(
          ask({ market: "spread", selection: "home", pointLine: -3.5, americanOdds: -110 }),
          { store },
        )
      ).run!;
      const recorded = await store.recordClosing({
        subject: { kind: "analysis", id: run.id },
        sportsbook: "Example Book",
        market: "spread",
        selection: "home",
        pointLine: -3.5,
        americanOdds: -120,
        observedAt: "2026-10-26T23:50:00.000Z",
        source: "manual-close",
        rules: { period: "full-game", overtime: "included" },
      });
      expect(recorded.kind).toBe("created");
      const listed = await store.listClosings();
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        subject: { kind: "analysis", id: run.id },
        sportsbook: "Example Book",
        market: "spread",
        selection: "home",
        pointLine: -3.5,
        americanOdds: -120,
        observedAt: "2026-10-26T23:50:00.000Z",
        source: "manual-close",
        provenance: "observed",
        rules: { period: "full-game", overtime: "included", tie: null },
      });
      expect(listed[0]?.comparison).toMatchObject({ available: true });
      if (listed[0]?.comparison.available) {
        expect(listed[0].comparison.openDecimal).toBeCloseTo(1.909090909, 6);
        expect(listed[0].comparison.closeDecimal).toBeCloseTo(1.833333333, 6);
        expect(listed[0].comparison.difference).toBeCloseTo(1.833333333 - 1.909090909, 6);
      }
    });

    it("keeps an earlier closing when a later one is recorded for the same subject", async () => {
      const store = await makeStore();
      const run = (await runAnalysis(ask(), { store })).run!;
      const first = await store.recordClosing({
        subject: { kind: "analysis", id: run.id },
        sportsbook: "Example Book",
        market: "moneyline",
        selection: "home",
        americanOdds: -115,
        observedAt: "2026-10-26T23:40:00.000Z",
        source: "manual-close",
        rules: { period: "full-game", overtime: "included", tie: "push" },
      });
      const second = await store.recordClosing({
        subject: { kind: "analysis", id: run.id },
        sportsbook: "Example Book",
        market: "moneyline",
        selection: "home",
        americanOdds: -120,
        observedAt: "2026-10-26T23:50:00.000Z",
        source: "manual-close",
        rules: { period: "full-game", overtime: "included", tie: "push" },
      });
      expect(first.kind).toBe("created");
      expect(second.kind).toBe("created");
      const odds = (await store.listClosings()).map((item) => item.americanOdds);
      expect(odds).toEqual([-115, -120]);
    });

    it("shows a moved point line separately and does not call it an odds change", async () => {
      const store = await makeStore();
      const run = (
        await runAnalysis(
          ask({ market: "spread", selection: "home", pointLine: -3.5, americanOdds: -110 }),
          { store },
        )
      ).run!;
      await store.recordClosing({
        subject: { kind: "analysis", id: run.id },
        sportsbook: "Example Book",
        market: "spread",
        selection: "home",
        pointLine: -3,
        americanOdds: -110,
        observedAt: "2026-10-26T23:50:00.000Z",
        source: "manual-close",
        rules: { period: "full-game", overtime: "included" },
      });
      const closing = (await store.listClosings())[0];
      expect(closing?.comparison).toEqual({
        available: false,
        reason: "different-contract",
        lineMovement: { openPointLine: -3.5, closePointLine: -3 },
      });
      expect(closing?.comparison).not.toEqual(expect.objectContaining({ difference: 0 }));
    });

    it("marks a missing comparable closing unavailable instead of zero", async () => {
      const store = await makeStore();
      const run = (await runAnalysis(ask(), { store })).run!;
      const views = await store.listClosings();
      expect(views.filter((item) => item.subject.id === run.id)).toEqual([]);
      const recorded = await store.recordBet({
        analysisId: run.id,
        submissionId: "closing-missing-bet",
        sportsbook: "Other Book",
        market: "moneyline",
        selection: "home",
        americanOdds: -108,
        stakeUnits: 1,
        placedAt: NOW,
        rules: { period: "full-game", overtime: "included", tie: "push" },
      });
      if (recorded.kind === "conflict") throw new Error(recorded.error);
      const after = await store.listClosings();
      expect(after.find((item) => item.subject.id === recorded.bet.id)).toBeUndefined();
    });

    it("compares an actual bet against its own contract, not the researched offer", async () => {
      const store = await makeStore();
      const run = (
        await runAnalysis(
          ask({ market: "spread", selection: "home", pointLine: -3, americanOdds: -110 }),
          { store },
        )
      ).run!;
      const recorded = await store.recordBet({
        analysisId: run.id,
        submissionId: "closing-bet-contract",
        sportsbook: "Execution Book",
        market: "spread",
        selection: "home",
        pointLine: -3.5,
        americanOdds: -105,
        stakeUnits: 1,
        placedAt: NOW,
        rules: { period: "full-game", overtime: "included" },
      });
      if (recorded.kind === "conflict") throw new Error(recorded.error);
      await store.recordClosing({
        subject: { kind: "bet", id: recorded.bet.id },
        sportsbook: "Execution Book",
        market: "spread",
        selection: "home",
        pointLine: -3.5,
        americanOdds: -115,
        observedAt: "2026-10-26T23:50:00.000Z",
        source: "manual-close",
        rules: { period: "full-game", overtime: "included" },
      });
      const closing = (await store.listClosings()).find((item) => item.subject.id === recorded.bet.id);
      expect(closing?.comparison.available).toBe(true);
      if (closing?.comparison.available) {
        expect(closing.comparison.openDecimal).toBeCloseTo(1.952380952, 6);
        expect(closing.comparison.closeDecimal).toBeCloseTo(1.869565217, 6);
      }
    });

    it("does not treat an untimestamped archived close as an observed offer", async () => {
      const store = await makeStore();
      if (!store.recordArchivedClosing) return;
      const run = (await runAnalysis(ask(), { store })).run!;
      await store.recordArchivedClosing({
        subject: { kind: "analysis", id: run.id },
        sportsbook: "Archived Book",
        market: "moneyline",
        selection: "home",
        americanOdds: -110,
        source: "nflverse-close",
      });
      const archived = (await store.listClosings())[0];
      expect(archived).toMatchObject({
        provenance: "archived-untimestamped",
        observedAt: null,
        comparison: { available: false, reason: "archived-untimestamped" },
      });
    });

    it("grades the researched line and the placed line from one score without mixing them", async () => {
      const store = await makeStore();
      const run = (
        await runAnalysis(
          ask({
            market: "spread",
            selection: "home",
            pointLine: -3,
            americanOdds: -110,
          }),
          { store },
        )
      ).run!;
      const recorded = await store.recordBet({
        analysisId: run.id,
        submissionId: submission("placement-half-point"),
        sportsbook: "Other Book",
        market: "spread",
        selection: "home",
        pointLine: -3.5,
        americanOdds: -105,
        stakeUnits: 1,
        placedAt: "2026-10-25T15:55:00.000Z",
        rules: { period: "full-game", overtime: "included" },
      });
      expect(recorded.kind).toBe("created");
      if (recorded.kind !== "created") throw new Error("expected a created bet");

      const settled = await store.recordSettlement({
        eventId: "final-dal-phi",
        analysisId: run.id,
        betId: recorded.bet.id,
        kind: "final",
        homeScore: 20,
        awayScore: 17,
        recordedAt: "2026-10-27T04:00:00.000Z",
        source: "official",
      });
      expect(settled.kind).toBe("recorded");
      if (settled.kind !== "recorded") throw new Error("expected a recorded settlement");

      const read = await store.readSettlement({ analysisId: run.id, betId: recorded.bet.id });
      expect(read.assessment).toMatchObject({
        result: "push",
        effective: "push",
        history: [{ id: settled.noticeId, result: "push" }],
      });
      expect(read.bet).toMatchObject({
        result: "loss",
        effective: "loss",
        history: [{ id: settled.noticeId, result: "loss" }],
      });
      expect((await store.getRun(run.id))?.offer.pointLine).toBe(-3);
      expect((await store.listBets()).find((item) => item.id === recorded.bet.id)?.pointLine).toBe(
        -3.5,
      );
    });

    it("ignores a repeated settlement notice and rejects a conflicting event identifier", async () => {
      const store = await makeStore();
      const run = (await runAnalysis(ask(), { store })).run!;
      const input = {
        eventId: "final-repeat",
        analysisId: run.id,
        kind: "final" as const,
        homeScore: 24,
        awayScore: 17,
        recordedAt: "2026-10-27T04:00:00.000Z",
        source: "official",
      };
      const first = await store.recordSettlement(input);
      const again = await store.recordSettlement(input);
      expect(first.kind).toBe("recorded");
      expect(again).toEqual(first.kind === "recorded" ? { kind: "duplicate", noticeId: first.noticeId } : first);
      const conflict = await store.recordSettlement({ ...input, homeScore: 10 });
      expect(conflict).toMatchObject({
        kind: "conflict",
        error: expect.stringMatching(/different inputs/i),
      });
      const read = await store.readSettlement({ analysisId: run.id });
      expect(read.assessment.history).toHaveLength(1);
      expect(read.assessment.effective).toBe("win");
    });

    it("keeps a postponement unresolved until a later final score is recorded", async () => {
      const store = await makeStore();
      const run = (await runAnalysis(ask(), { store })).run!;
      const postponed = await store.recordSettlement({
        eventId: "postponed-dal-phi",
        analysisId: run.id,
        kind: "postponed",
        recordedAt: "2026-10-26T23:00:00.000Z",
        source: "official",
        reason: "weather",
      });
      expect(postponed.kind).toBe("recorded");
      const open = await store.readSettlement({ analysisId: run.id });
      expect(open.assessment.effective).toBe("unresolved");
      expect(open.assessment.history).toHaveLength(1);

      const final = await store.recordSettlement({
        eventId: "final-after-postponement",
        analysisId: run.id,
        kind: "final",
        homeScore: 24,
        awayScore: 20,
        recordedAt: "2026-10-28T04:00:00.000Z",
        source: "official",
      });
      expect(final.kind).toBe("recorded");
      const closed = await store.readSettlement({ analysisId: run.id });
      expect(closed.assessment.history.map((row) => row.result)).toEqual(["unresolved", "win"]);
      expect(closed.assessment.effective).toBe("win");
    });

    it("keeps the earlier notice when a correction supplies a reason", async () => {
      const store = await makeStore();
      const run = (await runAnalysis(ask(), { store })).run!;
      const first = await store.recordSettlement({
        eventId: "early-score",
        analysisId: run.id,
        kind: "final",
        homeScore: 17,
        awayScore: 20,
        recordedAt: "2026-10-27T03:00:00.000Z",
        source: "official",
      });
      expect(first.kind).toBe("recorded");
      if (first.kind !== "recorded") throw new Error("expected a recorded settlement");
      const missing = await store.recordSettlement({
        eventId: "score-correction",
        analysisId: run.id,
        kind: "final",
        homeScore: 24,
        awayScore: 20,
        recordedAt: "2026-10-27T16:00:00.000Z",
        source: "official-correction",
        correctsNoticeId: first.noticeId,
      });
      expect(missing).toMatchObject({
        kind: "conflict",
        error: expect.stringMatching(/reason/i),
      });
      const corrected = await store.recordSettlement({
        eventId: "score-correction",
        analysisId: run.id,
        kind: "final",
        homeScore: 24,
        awayScore: 20,
        recordedAt: "2026-10-27T16:00:00.000Z",
        source: "official-correction",
        reason: "official score correction",
        correctsNoticeId: first.noticeId,
      });
      expect(corrected.kind).toBe("recorded");
      const read = await store.readSettlement({ analysisId: run.id });
      expect(read.assessment.history.map((row) => row.result)).toEqual(["loss", "win"]);
      expect(read.assessment.history[1]).toMatchObject({
        correctsId: first.noticeId,
        reason: "official score correction",
      });
      expect(read.assessment.effective).toBe("win");
      expect(read.assessment.history[0]?.id).toBe(first.noticeId);
    });

    it("rejects a bet for an analysis that does not exist", async () => {
      const store = await makeStore();
      await expect(
        store.recordBet({
          analysisId: "00000000-0000-4000-8000-000000000000",
          submissionId: submission("missing-analysis"),
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
