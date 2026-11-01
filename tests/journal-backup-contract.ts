import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { runGameBoard } from "#lib/server/analysis/board-run.ts";
import { createFixtureDrafter } from "#lib/server/analysis/fixture-drafter.ts";
import { loadFixtureGames } from "#lib/server/analysis/games.ts";
import { encodeJournalBackup, type JournalExport } from "#lib/server/analysis/journal-backup.ts";
import { runAnalysis, type AnalysisRequest, type ThesisDrafter } from "#lib/server/analysis/run.ts";
import type { JournalStore, ResearchStore } from "#lib/server/analysis/store.ts";
import { PROSPECTIVE_PROTOCOL } from "#lib/server/models/release.ts";
import { parseOffer } from "#lib/domain/offer.ts";
import { anchorPairOf } from "#lib/domain/board.ts";
import { quiet, scriptedModel } from "./board-fixtures.ts";
import { lifecycleInput, exchange } from "./board-explanation-contract.ts";

const NOW = "2026-10-25T16:00:00.000Z";
const game = loadFixtureGames("tests/fixtures/sources/games-minimized.csv", NOW).find(
  (item) => item.id === "2026_07_DAL_PHI",
)!;
const RULES = { period: "full-game", overtime: "included", tie: "push" } as const;

/** A memory journal backup in the layout written before both journals shared version 1 records. */
export const MEMORY_V1_FIXTURE = "tests/fixtures/journal/memory-v1.json";

/** A drafter whose provider reported tokens without a cost, so the total stays partial. */
const unknownCostDrafter: ThesisDrafter = (() => {
  const inner = createFixtureDrafter();
  return {
    ...inner,
    async draftThesis(input) {
      return {
        ...(await inner.draftThesis(input)),
        usage: { promptTokens: 900, completionTokens: null, totalTokens: null },
        usageCost: null,
      };
    },
  };
})();

/** A drafter whose request was sent and never answered, so the attempt is ambiguous. */
const ambiguousDrafter: ThesisDrafter = {
  ...createFixtureDrafter(),
  async draftThesis({ packet }) {
    return {
      draftingFailed: true,
      repairAttempted: false,
      refusal: null,
      error: { kind: "timeout", status: null, message: "timed out after the request was sent" },
      report: null,
      packet,
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

/**
 * Every kind of journal record through the public store interface: completed, refreshed, failed,
 * ambiguous, interrupted, and unfinished analyses; an analysis bet and a model-pick bet with
 * notices and corrections; closes; a board with an extra quote; a game notice; and prospective
 * registration and closing-market records.
 */
export async function recordMixedJournal(store: JournalStore, scope: string): Promise<void> {
  const ask = (id: string, overrides: Partial<AnalysisRequest> = {}): AnalysisRequest => ({
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
    requestId: `${scope}:${id}`,
  });
  const primary = await runAnalysis(ask("primary"), { store, drafter: unknownCostDrafter });
  if (!primary.ok) throw new Error(primary.error);
  const refresh = await runAnalysis(
    ask("refresh", {
      americanOdds: -105,
      observedAt: "2026-10-25T15:50:00.000Z",
      parentId: primary.run.id,
    }),
    { store },
  );
  if (!refresh.ok) throw new Error(refresh.error);
  const failed = await runAnalysis(ask("failed", { lean: undefined, rationale: undefined }), {
    store,
    collect: async () => {
      throw new Error("connection closed while waiting for source response");
    },
  });
  if (failed.run?.status !== "failed") throw new Error("expected a failed attempt");
  const ambiguous = await runAnalysis(ask("ambiguous"), { store, drafter: ambiguousDrafter });
  if (!ambiguous.run?.providerOutcomeAmbiguous) throw new Error("expected an ambiguous attempt");
  const stopping: ResearchStore = {
    ...store,
    async saveRun() {
      throw new Error("simulated process stop before finalization");
    },
  };
  let unfinishedId = "";
  const tracking: ResearchStore = {
    ...stopping,
    async beginAttempt(run) {
      const begun = await store.beginAttempt(run);
      if (begun.kind === "created") unfinishedId = begun.run.id;
      return begun;
    },
  };
  await runAnalysis(ask("unfinished"), { store: tracking }).catch(() => undefined);
  let interruptedId = "";
  await runAnalysis(ask("interrupted"), {
    store: {
      ...stopping,
      async beginAttempt(run) {
        const begun = await store.beginAttempt(run);
        if (begun.kind === "created") interruptedId = begun.run.id;
        return begun;
      },
    },
  }).catch(() => undefined);
  await store.markInterrupted(interruptedId);
  if (!unfinishedId || !interruptedId) throw new Error("expected unfinished attempts");

  const analysisBet = await store.recordBet({
    analysisId: primary.run.id,
    submissionId: `${scope}:analysis-bet`,
    sportsbook: "Placed Book",
    market: "spread",
    selection: "home",
    pointLine: -2.5,
    rules: RULES,
    americanOdds: -108,
    stakeUnits: 1.5,
    placedAt: "2026-10-25T15:40:00.000Z",
  });
  if (analysisBet.kind !== "created") throw new Error("analysis bet was not created");
  await store.recordClosing({
    subject: { kind: "analysis", id: primary.run.id },
    sportsbook: "Example Book",
    market: "moneyline",
    selection: "home",
    americanOdds: -125,
    observedAt: "2026-10-25T23:50:00.000Z",
    source: "closing screen",
    rules: RULES,
  });
  const first = await store.recordSettlement({
    eventId: `${scope}:analysis-final`,
    analysisId: primary.run.id,
    betId: analysisBet.bet.id,
    kind: "final",
    homeScore: 27,
    awayScore: 20,
    recordedAt: "2026-10-26T03:00:00.000Z",
    source: "box score",
  });
  if (first.kind !== "recorded") throw new Error("analysis notice was not recorded");
  await store.recordSettlement({
    eventId: `${scope}:analysis-correction`,
    analysisId: primary.run.id,
    betId: analysisBet.bet.id,
    kind: "final",
    homeScore: 20,
    awayScore: 27,
    recordedAt: "2026-10-26T04:00:00.000Z",
    source: "league",
    reason: "The first score was reversed.",
    correctsNoticeId: first.noticeId,
  });

  const registration = {
    id: `${scope}:registration`,
    cohort: "primary-model-picks" as const,
    protocol: { ...PROSPECTIVE_PROTOCOL, artifactChecksum: "a".repeat(64) },
  };
  await store.recordProtocolRegistration(registration);
  const board = await runGameBoard(
    {
      game,
      nowIso: NOW,
      scheduleRetrievedAt: "2026-10-25T12:00:00.000Z",
      sportsbook: "Board Book",
      observedAt: "2026-10-25T15:30:00.000Z",
      moneyline: { home: -150, away: 130, tieRule: "push" },
      spread: { homeLine: -3.5, awayLine: 3.5, home: -110, away: -110 },
      extraQuotes: [
        {
          sportsbook: "Shop Book",
          market: "moneyline",
          selection: "home",
          americanOdds: -135,
          pointLine: null,
          observedAt: "2026-10-25T15:20:00.000Z",
        },
        {
          sportsbook: "Shop Book",
          market: "spread",
          selection: "away",
          americanOdds: 100,
          pointLine: 3.5,
          observedAt: "2026-10-25T15:25:00.000Z",
        },
      ],
      requestId: `${scope}:board`,
    },
    {
      store,
      collect: quiet,
      model: scriptedModel({ home: { win: 0.64, loss: 0.36, push: 0 } }),
      drafter: createFixtureDrafter(),
    },
  );
  if (!board.ok) throw new Error(board.error);
  const pick = board.board.markets[0]!.pick!;
  const pickBet = await store.recordBet({
    modelPickId: pick.id,
    submissionId: `${scope}:pick-bet`,
    sportsbook: "Shop Book",
    market: "moneyline",
    selection: "home",
    rules: RULES,
    americanOdds: -135,
    stakeUnits: 1,
    placedAt: "2026-10-25T15:45:00.000Z",
  });
  if (pickBet.kind !== "created") throw new Error("pick bet was not created");
  await store.recordClosing({
    subject: { kind: "bet", id: pickBet.bet.id },
    sportsbook: "Shop Book",
    market: "moneyline",
    selection: "home",
    americanOdds: -150,
    observedAt: "2026-10-25T20:00:00.000Z",
    source: "closing screen",
    rules: RULES,
  });
  const betNotice = await store.recordSettlement({
    eventId: `${scope}:bet-final`,
    betId: pickBet.bet.id,
    kind: "final",
    homeScore: 24,
    awayScore: 21,
    recordedAt: "2026-10-26T04:00:00.000Z",
    source: "box score",
  });
  if (betNotice.kind !== "recorded") throw new Error("bet notice was not recorded");
  await store.recordSettlement({
    eventId: `${scope}:bet-correction`,
    betId: pickBet.bet.id,
    kind: "final",
    homeScore: 21,
    awayScore: 24,
    recordedAt: "2026-10-26T05:00:00.000Z",
    source: "league",
    reason: "The first score was reversed.",
    correctsNoticeId: betNotice.noticeId,
  });
  await store.recordGameSettlement({
    eventId: `${scope}:game-final`,
    gameId: game.id,
    kind: "final",
    homeScore: 24,
    awayScore: 21,
    recordedAt: "2026-10-26T04:30:00.000Z",
    source: "box score",
  });
  const quote = (selection: "home" | "away") =>
    parseOffer({
      gameId: game.id,
      sportsbook: "Board Book",
      market: "moneyline",
      selection,
      americanOdds: selection === "home" ? -160 : 140,
      observedAt: "2026-10-25T20:05:00.000Z",
      kickoffAt: game.kickoff,
      rules: RULES,
    });
  await store.recordClosingMarketSnapshot({
    id: randomUUID(),
    gameId: game.id,
    market: "moneyline",
    offers: [quote("home"), quote("away")],
    observedAt: "2026-10-25T20:05:00.000Z",
    source: "book",
  });
}

function collectionSizes(backup: JournalExport): Record<string, number> {
  return Object.fromEntries(
    Object.entries(backup)
      .filter(([, rows]) => Array.isArray(rows))
      .map(([key, rows]) => [key, (rows as unknown[]).length]),
  );
}

/**
 * Version 1 portability every journal must share. `makePeer` builds the other journal, so a
 * backup crosses from this journal to the peer and back.
 */
export function describeJournalBackupContract(
  name: string,
  makeStore: () => JournalStore | Promise<JournalStore>,
  peer: { name: string; makeStore: () => JournalStore | Promise<JournalStore> },
) {
  const scope = () => `${name}:${expect.getState().currentTestName ?? "case"}`;

  describe(`${name} journal backup`, () => {
    it(`keeps failed and ambiguous explanation history through ${peer.name} and back`, async () => {
      const source = await makeStore();
      const ids: string[] = [];
      for (const outcome of ["failed", "ambiguous"] as const) {
        const begun = await source.beginBoard(lifecycleInput(`${scope()}:${outcome}`));
        if (begun.kind === "conflict") throw new Error(begun.error);
        const boardId = begun.board.id;
        ids.push(boardId);
        await source.completeBoardForecast({
          boardId,
          evidence: [],
          gaps: [],
          markets: [{ market: "moneyline", noPickReason: "Unavailable" }],
        });
        const attemptId = `${scope()}:${outcome}:attempt`;
        const requestId = `${attemptId}:original`;
        await source.beginBoardExplanation({
          boardId,
          attemptId,
          drafter: { id: "fixture", modelId: "test" },
        });
        await source.reserveBoardExplanationRequest({
          boardId,
          attemptId,
          requestId,
          role: "original",
          bodyHash: "a".repeat(64),
        });
        if (outcome === "failed") {
          await source.recordBoardExplanationResponse({ boardId, attemptId, requestId, exchange });
          await source.finishBoardExplanation({
            boardId,
            attemptId,
            outcome: { kind: "failed", reasons: ["Contradiction"] },
          });
        } else {
          await source.finishBoardExplanation({
            boardId,
            attemptId,
            outcome: { kind: "ambiguous", reason: "No durable response" },
          });
        }
      }
      const original = await source.exportJournal();
      expect(original.explanationEvents).toHaveLength(7);
      const other = await peer.makeStore();
      await other.restoreJournal(JSON.parse(encodeJournalBackup(original, { secrets: [] })));
      expect(await other.exportJournal()).toEqual(original);
      const back = await makeStore();
      await back.restoreJournal(
        JSON.parse(encodeJournalBackup(await other.exportJournal(), { secrets: [] })),
      );
      expect(await back.exportJournal()).toEqual(original);
      for (const id of ids) expect(await back.getBoard(id)).toEqual(await source.getBoard(id));
      const failed = await back.getBoard(ids[0]!);
      expect(failed?.status).toBe("completed");
      expect(failed?.usage).toMatchObject({ promptTokens: 2, costUsd: null, partial: true });
      expect((await back.getBoard(ids[1]!))?.providerOutcomeAmbiguous).toBe(true);
      const broken = structuredClone(original);
      broken.explanationEvents![1]!.sequence = 999;
      await expect(back.restoreJournal(broken)).rejects.toThrow();
      expect(await back.exportJournal()).toEqual(original);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it(`keeps the complete graph from ${name} through ${peer.name} and back`, async () => {
      const source = await makeStore();
      await recordMixedJournal(source, scope());
      const exported = await source.exportJournal();
      expect(collectionSizes(exported)).toMatchObject({
        games: 1,
        offers: 7,
        evidence: expect.any(Number),
        analyses: 6,
        reports: 2,
        userResearch: 5,
        bets: 2,
        closings: 2,
        settlementNotices: 4,
        gameSettlementNotices: 1,
        gameBoards: 1,
        protocolRegistrations: 1,
        closingMarketSnapshots: 1,
      });
      const [moneyline, spread] = exported.gameBoards![0]!.markets;
      expect(
        [moneyline!, spread!].map((market) =>
          market.pricing?.anchor.map((side) => [side.sportsbook, side.americanOdds]),
        ),
      ).toEqual([
        [
          ["Board Book", -150],
          ["Board Book", 130],
        ],
        [
          ["Board Book", -110],
          ["Board Book", -110],
        ],
      ]);
      expect(moneyline!.offers[0]).toMatchObject({
        sportsbook: "Shop Book",
        americanOdds: -135,
        observedAt: "2026-10-25T15:20:00.000Z",
      });
      expect(spread!.offers[1]).toMatchObject({
        sportsbook: "Shop Book",
        selection: "away",
        pointLine: 3.5,
        americanOdds: 100,
      });
      expect([moneyline!.quotes.length, spread!.quotes.length]).toEqual([1, 1]);
      expect(exported).not.toHaveProperty("runs");
      expect(exported).not.toHaveProperty("actualBets");
      expect(exported).not.toHaveProperty("closingObservations");
      expect(exported).not.toHaveProperty("notices");
      expect(exported.analyses.map((row) => row.status).sort()).toEqual([
        "completed",
        "completed",
        "failed",
        "failed",
        "interrupted",
        "running",
      ]);
      const ambiguous = exported.analyses.find((row) => row.snapshot.providerOutcomeAmbiguous);
      expect(ambiguous?.snapshot.providerRequests?.[0]?.outcome).toBe("ambiguous");
      expect(exported.analyses.map((row) => row.usage)).toContainEqual(
        expect.objectContaining({ costUsd: null, partial: true }),
      );

      const file = encodeJournalBackup(exported, { secrets: [] });
      const other = await peer.makeStore();
      await other.restoreJournal(JSON.parse(file));
      expect(await other.exportJournal()).toEqual(exported);

      const back = await makeStore();
      await back.restoreJournal(
        JSON.parse(encodeJournalBackup(await other.exportJournal(), { secrets: [] })),
      );
      expect(await back.exportJournal()).toEqual(exported);
      const primary = exported.analyses.find((row) => row.assessmentRole === "primary")!;
      expect(await back.getRun(primary.id)).toEqual(await source.getRun(primary.id));
      const boardId = exported.gameBoards![0]!.id;
      expect(await back.getBoard(boardId)).toEqual(await source.getBoard(boardId));
      // Bets and closes carry no creation time in the file, so a restored list is in id order.
      const byId = <T extends { id: string }>(rows: T[]) =>
        [...rows].sort((left, right) => (left.id < right.id ? -1 : 1));
      expect(byId(await back.listBets())).toEqual(byId(await source.listBets()));
      expect(byId(await back.listClosings())).toEqual(byId(await source.listClosings()));
    });

    it("adds nothing when the same backup is restored again", async () => {
      const source = await makeStore();
      await recordMixedJournal(source, scope());
      const exported = await source.exportJournal();
      const target = await makeStore();
      await target.restoreJournal(structuredClone(exported));
      await target.restoreJournal(structuredClone(exported));
      expect(await target.exportJournal()).toEqual(exported);
      await source.restoreJournal(structuredClone(exported));
      expect(await source.exportJournal()).toEqual(exported);
    });

    it("changes nothing when one record is malformed or conflicts with the destination", async () => {
      const source = await makeStore();
      await recordMixedJournal(source, scope());
      const exported = await source.exportJournal();
      const target = await makeStore();
      await recordMixedJournal(target, `${scope()}:destination`);
      const before = await target.exportJournal();

      const damaged: unknown[] = [];
      const malformed = structuredClone(exported);
      malformed.bets[1] = { ...malformed.bets[1]!, stakeUnits: "one" as never };
      damaged.push(malformed);
      const missing = structuredClone(exported);
      missing.closings[0] = { ...missing.closings[0]!, betId: randomUUID(), analysisId: null };
      damaged.push(missing);
      const cycle = structuredClone(exported);
      const [left, right] = cycle.settlementNotices!.filter((row) => row.betId && !row.analysisId);
      left!.correctsId = right!.id;
      right!.correctsId = left!.id;
      damaged.push(cycle);
      const repeated = structuredClone(exported);
      repeated.offers.push({ ...repeated.offers[0]! });
      damaged.push(repeated);
      const unknownField = structuredClone(exported);
      Object.assign(unknownField.gameBoards![0]!.markets[0]!, { anchor: { format: 9 } });
      damaged.push(unknownField);
      const futurePricing = structuredClone(exported);
      Object.assign(futurePricing.gameBoards![0]!.markets[0]!.pricing!, {
        format: "paired-anchor-9",
      });
      damaged.push(futurePricing);
      const otherContract = structuredClone(exported);
      const spreadAnchor = otherContract.gameBoards![0]!.markets[1]!.pricing!.anchor;
      spreadAnchor[1] = { ...spreadAnchor[1], pointLine: -3.5 };
      damaged.push(otherContract);
      const future = {
        ...structuredClone(exported),
        boardExplanationEvents: [],
      };
      damaged.push(future);
      const mixed = { ...structuredClone(exported), runs: [], actualBets: [], notices: [] };
      damaged.push(mixed);
      const conflicting = structuredClone(before);
      conflicting.analyses[0] = { ...conflicting.analyses[0]!, failureReason: "rewritten" };
      conflicting.games = [];
      damaged.push({ ...exported, ...conflicting, games: exported.games });

      for (const backup of damaged) {
        await expect(target.restoreJournal(backup)).rejects.toThrow();
        expect(await target.exportJournal()).toEqual(before);
      }
    });

    it("restores a board market saved before its anchor pair without inventing one", async () => {
      const source = await makeStore();
      await recordMixedJournal(source, scope());
      const older = structuredClone(await source.exportJournal());
      for (const market of older.gameBoards![0]!.markets) delete market.pricing;
      const target = await makeStore();
      await target.restoreJournal(structuredClone(older));
      const restored = await target.exportJournal();
      expect(restored.gameBoards).toEqual(older.gameBoards);
      const board = (await target.getBoard(older.gameBoards![0]!.id))!;
      for (const market of board.markets) expect(market).not.toHaveProperty("pricing");
      expect(
        anchorPairOf(board.markets[0]!)?.map((side) => [side.sportsbook, side.americanOdds]),
      ).toEqual([
        ["Board Book", -150],
        ["Board Book", 130],
      ]);
    });

    it("restores a normalized backup written before boards and later collections", async () => {
      const source = await makeStore();
      await runAnalysis(
        {
          game,
          nowIso: NOW,
          sportsbook: "Example Book",
          market: "moneyline",
          selection: "home",
          americanOdds: -110,
          observedAt: "2026-10-25T15:30:00.000Z",
          tieRule: "push",
          requestId: `${scope()}:older`,
        },
        { store: source },
      );
      const exported = await source.exportJournal();
      const older: Record<string, unknown> = structuredClone(exported);
      for (const key of [
        "settlementNotices",
        "gameBoards",
        "protocolRegistrations",
        "closingMarketSnapshots",
        "gameSettlementNotices",
      ]) {
        delete older[key];
      }
      for (const row of older.evidence as Record<string, unknown>[]) delete row.packetItemId;
      for (const row of older.offers as Record<string, unknown>[]) delete row.opposing;
      const target = await makeStore();
      await target.restoreJournal(structuredClone(older));
      await target.restoreJournal(structuredClone(older));
      const restored = await target.exportJournal();
      expect(restored.analyses).toEqual(exported.analyses);
      expect(restored.offers).toEqual(exported.offers);
      expect(restored.evidence.map((row) => row.packetItemId)).toEqual(
        exported.evidence.map(() => null),
      );
      expect(restored.gameBoards).toEqual([]);
    });

    it("restores a memory backup in the earlier layout without inventing facts", async () => {
      const legacy = JSON.parse(readFileSync(MEMORY_V1_FIXTURE, "utf8")) as Record<string, any>;
      const target = await makeStore();
      await target.restoreJournal(structuredClone(legacy));
      await target.restoreJournal(structuredClone(legacy));
      const restored = await target.exportJournal();
      expect(restored).not.toHaveProperty("runs");
      expect(restored.analyses.map((row) => row.id).sort()).toEqual(
        legacy.runs.map((run: { id: string }) => run.id).sort(),
      );
      for (const run of legacy.runs) {
        const saved = await target.getRun(run.id);
        expect(saved?.offer).toEqual(run.offer);
        expect(saved?.game).toEqual(run.game);
        expect(saved?.createdAt).toBe(run.createdAt);
        expect(saved?.completedAt).toBe(run.completedAt);
        expect(saved?.providerRequests).toEqual(run.providerRequests);
        expect(saved?.usage).toEqual(run.usage);
        expect(saved?.report).toEqual(run.report);
      }
      expect(restored.bets.map((row) => row.id).sort()).toEqual(
        legacy.actualBets.map((bet: { id: string }) => bet.id).sort(),
      );
      expect(restored.settlementNotices!.map((row) => row.id).sort()).toEqual(
        legacy.notices
          .filter((notice: { gameId: string | null }) => notice.gameId === null)
          .map((notice: { id: string }) => notice.id)
          .sort(),
      );
      expect(restored.gameBoards).toEqual(legacy.gameBoards);

      const earliest = structuredClone(legacy);
      for (const key of [
        "gameBoards",
        "gameSettlementNotices",
        "protocolRegistrations",
        "closingMarketSnapshots",
      ]) {
        delete earliest[key];
      }
      earliest.actualBets = earliest.actualBets
        .filter((bet: { modelPickId: string | null }) => bet.modelPickId === null)
        .map(({ modelPickId: _pick, game: _game, ...bet }: Record<string, unknown>) => bet);
      const kept = new Set(earliest.actualBets.map((bet: { id: string }) => bet.id));
      earliest.notices = earliest.notices
        .filter(
          (notice: { gameId: string | null; betId: string | null; analysisId: string | null }) =>
            notice.gameId === null && (notice.analysisId !== null || kept.has(notice.betId!)),
        )
        .map(({ gameId: _game, ...notice }: Record<string, unknown>) => notice);
      earliest.closingObservations = earliest.closingObservations.filter(
        (closing: { subject: { kind: string; id: string } }) =>
          closing.subject.kind === "analysis" || kept.has(closing.subject.id),
      );
      const blank = await makeStore();
      await blank.restoreJournal(earliest);
      expect((await blank.exportJournal()).analyses).toEqual(restored.analyses);

      const unrepresentable = structuredClone(legacy);
      const completed = unrepresentable.runs.find((run: { report: unknown }) => run.report);
      completed.completedAt = null;
      const before = await blank.exportJournal();
      await expect(blank.restoreJournal(unrepresentable)).rejects.toThrow(/completion time/i);
      expect(await blank.exportJournal()).toEqual(before);
    });

    it("sends no source or provider request while restoring", async () => {
      const source = await makeStore();
      await recordMixedJournal(source, scope());
      const exported = await source.exportJournal();
      const requests: string[] = [];
      vi.stubGlobal("fetch", async (input: unknown) => {
        requests.push(String(input));
        throw new Error("restore must not send a request");
      });
      const target = await makeStore();
      await target.restoreJournal(exported);
      expect(requests).toEqual([]);
      const unfinished = exported.analyses.find((row) => row.status === "running")!;
      expect((await target.exportJournal()).analyses).toContainEqual(unfinished);
    });
  });
}
