import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { loadFixtureGames } from "#lib/server/analysis/games.ts";
import { runGameBoard, type GameBoardRequest } from "#lib/server/analysis/board-run.ts";
import type { SavedForecast } from "#lib/server/analysis/forecast-record.ts";
import {
  modelPickPerformance,
  prospectiveForecastRecords,
} from "#lib/server/analysis/model-pick-performance.ts";
import { snapshot } from "#lib/server/analysis/run.ts";
import { journalSummaries } from "#lib/server/analysis/summary.ts";
import type { JournalStore } from "#lib/server/analysis/store.ts";
import { quiet, scriptedModel } from "./board-fixtures.ts";

const NOW = "2026-10-25T16:00:00.000Z";
const LATER = "2026-10-25T17:00:00.000Z";
const game = loadFixtureGames("tests/fixtures/sources/games-minimized.csv", NOW).find(
  (item) => item.id === "2026_07_DAL_PHI",
)!;

/** A saved forecast the model produced at decision time. Only the fields under test matter. */
function frozenForecast(win: number, loss: number): SavedForecast {
  return {
    version: 1,
    provenance: "captured",
    decisionCutoff: NOW,
    artifact: { checksum: "f".repeat(64), version: 4 },
    probabilities: { win, loss, push: 0 },
  } as unknown as SavedForecast;
}

/** Behaviour every journal must share for primary model picks and their performance. */
export function describeModelPickPerformanceContract(
  name: string,
  makeStore: () => JournalStore | Promise<JournalStore>,
  isolate?: { beforeEach?: () => Promise<void>; afterEach?: () => Promise<void> },
) {
  const scopeOf = () => `${name}:${expect.getState().currentTestName ?? "case"}`;
  const ask = (overrides: Partial<GameBoardRequest> = {}): GameBoardRequest => ({
    game,
    nowIso: NOW,
    scheduleRetrievedAt: "2026-10-25T12:00:00.000Z",
    sportsbook: "Board Book",
    observedAt: "2026-10-25T15:30:00.000Z",
    moneyline: { home: -150, away: 130, tieRule: "push" },
    ...overrides,
    requestId: `${scopeOf()}:${overrides.requestId ?? "board"}`,
  });
  const scripted = () => scriptedModel({ home: { win: 0.55, loss: 0.43, push: 0.02 } });
  const threeMarkets = (overrides: Partial<GameBoardRequest> = {}) =>
    ask({
      spread: { homeLine: -3, awayLine: 3, home: -110, away: -110 },
      total: { overLine: 44.5, underLine: 44.5, over: -105, under: -115 },
      ...overrides,
    });

  async function freeze(store: JournalStore, request: GameBoardRequest) {
    const outcome = await runGameBoard(request, { store, collect: quiet, model: scripted() });
    expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
    return outcome.board!;
  }

  const roleOf = (board: Awaited<ReturnType<typeof freeze>>, market: string) =>
    board.markets.find((item) => item.market === market)?.pick?.role;

  describe(`${name} primary model picks`, () => {
    if (isolate?.beforeEach) beforeEach(isolate.beforeEach);
    if (isolate?.afterEach) afterEach(isolate.afterEach);

    it("freezes the earliest completed model pick per market as primary and later ones as refreshes", async () => {
      const store = await makeStore();
      const first = await freeze(store, ask({ requestId: "first" }));
      const second = await freeze(
        store,
        threeMarkets({
          requestId: "second",
          nowIso: LATER,
          observedAt: "2026-10-25T16:30:00.000Z",
        }),
      );
      expect(roleOf(first, "moneyline")).toMatchObject({
        role: "primary",
        reason: "Earliest completed model pick before kickoff",
        protocolId: "prospective-2026-10-26",
      });
      // The second board is the first with a spread and a total, so those two are primary.
      expect(roleOf(second, "moneyline")).toMatchObject({
        role: "refresh",
        primaryPickId: first.markets[0]!.pick!.id,
      });
      expect(roleOf(second, "spread")?.role).toBe("primary");
      expect(roleOf(second, "total")?.role).toBe("primary");
      // Reading back never reclassifies, and the first board is unchanged.
      expect(await store.getBoard(first.id)).toEqual(first);
      expect(await store.getBoard(second.id)).toEqual(second);
    });

    it("never makes a refreshed board's pick primary", async () => {
      const store = await makeStore();
      const parent = await freeze(store, ask({ requestId: "parent" }));
      const child = await freeze(
        store,
        threeMarkets({
          requestId: "child",
          parentId: parent.id,
          nowIso: LATER,
          observedAt: "2026-10-25T16:30:00.000Z",
        }),
      );
      expect(roleOf(child, "moneyline")).toMatchObject({
        role: "refresh",
        primaryPickId: parent.markets[0]!.pick!.id,
      });
      // A market the parent never priced has no primary to refresh, and a refresh is not one.
      expect(roleOf(child, "spread")).toMatchObject({ role: "refresh", primaryPickId: null });
      const listed = await store.listModelPicks();
      expect(listed.filter((item) => item.pick.role.role === "primary")).toHaveLength(1);
    });

    it("gives a board that did not complete no primary model pick", async () => {
      const store = await makeStore();
      const board = await freeze(store, ask({ requestId: "kept" }));
      const failed = await store.beginBoard({
        request: { id: `${scopeOf()}:failed`, hash: "failed" },
        parentId: null,
        game: board.game,
        sportsbook: "Board Book",
        observedAt: "2026-10-25T15:00:00.000Z",
        cutoffAt: "2026-10-25T15:30:00.000Z",
        markets: board.markets.map(({ market, offers }) => ({ market, offers })),
      });
      if (failed.kind !== "created") throw new Error("expected a new board");
      await store.freezeModelPicks({
        boardId: failed.board.id,
        evidence: [],
        gaps: [],
        markets: [
          {
            market: "moneyline",
            pick: {
              parentPickId: null,
              forecastingModel: board.markets[0]!.pick!.forecastingModel,
              calculation: board.markets[0]!.pick!.calculation,
              forecast: null,
            },
          },
        ],
      });
      const finished = await store.finishBoard({
        boardId: failed.board.id,
        status: "failed",
        failureReason: "drafter failed",
      });
      expect(finished.markets[0]?.pick?.role).toMatchObject({ role: "ineligible" });
      expect((await store.getBoard(board.id))?.markets[0]?.pick?.role.role).toBe("primary");
    });

    it("leaves a pick unclassified until its board finishes", async () => {
      const store = await makeStore();
      const begun = await store.beginBoard({
        request: { id: `${scopeOf()}:open`, hash: "open" },
        parentId: null,
        game: snapshot(game),
        sportsbook: "Board Book",
        observedAt: "2026-10-25T15:00:00.000Z",
        cutoffAt: NOW,
        markets: (await freeze(store, ask({ requestId: "seed" }))).markets.map(
          ({ market, offers }) => ({ market, offers }),
        ),
      });
      if (begun.kind !== "created") throw new Error("expected a new board");
      const frozen = await store.freezeModelPicks({
        boardId: begun.board.id,
        evidence: [],
        gaps: [],
        markets: [
          {
            market: "moneyline",
            pick: {
              parentPickId: null,
              forecastingModel: (await store.listModelPicks())[0]!.pick.forecastingModel,
              calculation: (await store.listModelPicks())[0]!.pick.calculation,
              forecast: null,
            },
          },
        ],
      });
      expect(frozen.markets[0]?.pick?.role.role).toBe("unclassified");
      // An unfinished board is not listed, so it cannot enter the performance sample.
      expect(await store.listModelPicks()).toHaveLength(1);
    });

    it("keeps a single primary when two boards of one game finish together", async () => {
      const store = await makeStore();
      const outcomes = await Promise.all(
        ["a", "b", "c"].map((id) =>
          runGameBoard(ask({ requestId: id }), { store, collect: quiet, model: scripted() }),
        ),
      );
      expect(outcomes.every((item) => item.ok)).toBe(true);
      const roles = (await store.listModelPicks()).map((item) => item.pick.role.role);
      expect(roles.filter((role) => role === "primary")).toHaveLength(1);
      expect(roles.filter((role) => role === "refresh")).toHaveLength(2);
    });

    it("records the primary forecast as captured, without asking the model again", async () => {
      const store = await makeStore();
      const model = scripted();
      let captured = 0;
      const outcome = await runGameBoard(ask({ requestId: "forecast" }), {
        store,
        collect: quiet,
        model,
        forecast: async () => {
          captured += 1;
          return frozenForecast(0.41, 0.59);
        },
      });
      expect(outcome.ok).toBe(true);
      const priced = model.offers.length;
      const listed = await store.listModelPicks();
      const records = prospectiveForecastRecords(listed);
      expect(records).toEqual([
        expect.objectContaining({
          id: listed[0]!.pick.id,
          artifactChecksum: "f".repeat(64),
          market: "moneyline",
          probabilities: { win: 0.41, loss: 0.59, push: 0 },
          decisionCutoff: NOW,
          slate: "2026-7",
          closingBaseline: null,
          outcome: null,
        }),
      ]);
      // A later read reclassifies nothing and regenerates nothing.
      await store.listModelPicks();
      expect(captured).toBe(1);
      expect(model.offers.length).toBe(priced);
      expect(listed[0]!.pick.role).toMatchObject({ protocolId: "prospective-2026-10-26" });
    });

    describe("performance", () => {
      const final = (eventId: string, homeScore: number, awayScore: number, extra = {}) => ({
        eventId: `${scopeOf()}:${eventId}`,
        gameId: game.id,
        kind: "final" as const,
        homeScore,
        awayScore,
        recordedAt: "2026-10-27T04:00:00.000Z",
        source: "official",
        ...extra,
      });
      const close = (
        subjectId: string,
        market: "moneyline" | "spread" | "total",
        selection: "home" | "away" | "over" | "under",
        americanOdds: number,
        pointLine?: number,
      ) => ({
        subject: { kind: "model-pick" as const, id: subjectId },
        sportsbook: "Board Book",
        market,
        selection,
        pointLine,
        rules: {
          period: "full-game" as const,
          overtime: "included" as const,
          ...(market === "moneyline" ? { tie: "push" as const } : {}),
        },
        americanOdds,
        observedAt: "2026-10-26T20:00:00.000Z",
        source: "closing screen",
      });

      it("counts unresolved picks as unavailable, never as a loss or a zero return", async () => {
        const store = await makeStore();
        await freeze(store, threeMarkets());
        const performance = modelPickPerformance(await store.listModelPicks(), []);
        expect(performance.overall).toMatchObject({
          sample: "model-picks",
          graded: 0,
          unavailable: 3,
          counts: { settled: 0, unresolved: 3, push: 0, void: 0, missingClosing: 3, primary: 3 },
          denominators: { returnOnSettledStakes: 0, closingComparisons: 0 },
          roi: { available: false },
        });
      });

      it("breaks primary picks down by market and grade with explicit denominators", async () => {
        const store = await makeStore();
        const board = await freeze(store, threeMarkets());
        const [moneyline, spread] = board.markets.map((item) => item.pick!);
        await store.recordGameSettlement(final("final", 24, 21));
        // Same contract later: comparable. Another line: line movement. No close for the total.
        await store.recordClosing(close(moneyline!.id, "moneyline", "away", 140));
        await store.recordClosing(close(spread!.id, "spread", "home", -110, -3.5));
        const performance = modelPickPerformance(
          await store.listModelPicks(),
          await store.listClosings(),
        );
        // 24-21 home win: the away moneyline loses, home -3 pushes, 45 combined clears 44.5.
        expect(performance.rows.map((row) => [row.market, row.result])).toEqual([
          ["moneyline", "loss"],
          ["spread", "push"],
          ["total", "win"],
        ]);
        expect(performance.overall.counts).toMatchObject({
          settled: 2,
          push: 1,
          unresolved: 0,
          void: 0,
          missingClosing: 2,
          primary: 3,
        });
        expect(performance.overall.denominators).toEqual({
          returnOnSettledStakes: 2,
          closingComparisons: 1,
        });
        // One unit: -1 on the loss, 100/105 on the over at -105, nothing on the push.
        expect(performance.overall.roi).toMatchObject({ available: true });
        const roi = performance.overall.roi;
        expect(roi.available && roi.roi).toBeCloseTo((-1 + 100 / 105) / 2, 10);
        expect(performance.byMarket.spread.counts).toMatchObject({ push: 1, settled: 0 });
        expect(performance.byMarket.spread.roi).toMatchObject({ available: false });
        expect(performance.byMarket.total.denominators.returnOnSettledStakes).toBe(1);
        expect(performance.byMarket.moneyline.counts.settled).toBe(1);
        // A close at the same contract compares; a different line is line movement.
        expect(performance.rows[0]!.closing).toMatchObject({ state: "comparable" });
        expect(performance.rows[1]!.closing).toEqual({
          state: "line-movement",
          openPointLine: -3,
          closePointLine: -3.5,
        });
        expect(performance.rows[2]!.closing).toEqual({ state: "missing" });
        // Every grade slice adds up to the whole.
        const grades = Object.values(performance.byGrade);
        expect(grades.reduce((sum, item) => sum + (item.counts.primary ?? 0), 0)).toBe(3);
        expect(grades.reduce((sum, item) => sum + item.counts.settled, 0)).toBe(2);
        expect(grades.reduce((sum, item) => sum + item.counts.push, 0)).toBe(1);
      });

      it("returns stake on a void and leaves it out of the return denominator", async () => {
        const store = await makeStore();
        await freeze(store, ask());
        await store.recordGameSettlement({
          eventId: `${scopeOf()}:void`,
          gameId: game.id,
          kind: "void",
          recordedAt: "2026-10-27T04:00:00.000Z",
          source: "official",
        });
        const performance = modelPickPerformance(await store.listModelPicks(), []);
        expect(performance.overall.counts).toMatchObject({ void: 1, settled: 0 });
        expect(performance.overall.denominators.returnOnSettledStakes).toBe(0);
        expect(performance.rows[0]).toMatchObject({ result: "void", unitProfit: 0 });
        expect(performance.overall.roi).toMatchObject({ available: false });
      });

      it("regrades from a correction and counts only primaries, leaving other summaries unchanged", async () => {
        const store = await makeStore();
        const first = await freeze(store, ask({ requestId: "first" }));
        await freeze(
          store,
          ask({
            requestId: "refresh",
            nowIso: LATER,
            observedAt: "2026-10-25T16:30:00.000Z",
            moneyline: { home: -170, away: 150, tieRule: "push" },
          }),
        );
        const notice = await store.recordGameSettlement(final("first", 24, 21));
        if (notice.kind !== "recorded") throw new Error("expected a recorded notice");
        await store.recordGameSettlement(
          final("corrected", 17, 20, {
            correctsNoticeId: notice.noticeId,
            reason: "Official score changed",
          }),
        );
        const listed = await store.listModelPicks();
        expect(listed).toHaveLength(2);
        const performance = modelPickPerformance(listed, await store.listClosings());
        expect(performance.rows).toHaveLength(1);
        expect(performance.rows[0]).toMatchObject({
          pickId: first.markets[0]!.pick!.id,
          result: "win",
        });
        expect(performance.overall.counts).toMatchObject({ settled: 1, primary: 1, refresh: 1 });
        expect(performance.excluded).toEqual({ refresh: 1, ineligible: 0, unclassified: 0 });
        // Research and actual-bet summaries never see a model pick.
        const journal = journalSummaries({
          assessments: await Promise.all(
            (await store.listCompleted()).map(async (run) => {
              const grade = (await store.readSettlement({ analysisId: run.id })).assessment;
              if (!grade) throw new Error(`Analysis not found: ${run.id}`);
              return {
                ...run,
                americanOdds: run.offer.americanOdds,
                grade,
              };
            }),
          ),
          bets: [],
          closings: await store.listClosings(),
        });
        expect(journal.assessments.counts).toMatchObject({ settled: 0, unresolved: 0 });
        expect(journal.bets.counts.bets).toBe(0);
      });

      it("does not mix a bet placed from a pick into model-pick performance", async () => {
        const store = await makeStore();
        const board = await freeze(store, ask());
        const pick = board.markets[0]!.pick!;
        await store.recordBet({
          modelPickId: pick.id,
          submissionId: `${scopeOf()}:bet`,
          sportsbook: "Corner Book",
          market: "moneyline",
          selection: "away",
          rules: { period: "full-game", overtime: "included", tie: "push" },
          americanOdds: 125,
          stakeUnits: 3,
          placedAt: "2026-10-25T17:00:00.000Z",
        });
        await store.recordGameSettlement(final("final", 10, 20));
        const performance = modelPickPerformance(await store.listModelPicks(), []);
        // One unit on the picked contract (away, +130), not three at the placed +125.
        expect(performance.overall.denominators.returnOnSettledStakes).toBe(1);
        expect(performance.rows[0]).toMatchObject({ result: "win", americanOdds: 130 });
        expect(performance.rows[0]!.unitProfit).toBeCloseTo(1.3, 10);
      });

      it("rejects a close for a model pick that does not exist", async () => {
        const store = await makeStore();
        await expect(
          store.recordClosing(
            close("00000000-0000-4000-8000-000000000000", "moneyline", "away", 140),
          ),
        ).rejects.toThrow();
      });
    });
  });
}
