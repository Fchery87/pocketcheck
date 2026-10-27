import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { loadFixtureGames } from "#lib/server/analysis/games.ts";
import { runGameBoard, type GameBoardRequest } from "#lib/server/analysis/board-run.ts";
import type { JournalStore } from "#lib/server/analysis/store.ts";
import { quiet, scriptedModel } from "./board-fixtures.ts";

const NOW = "2026-10-25T16:00:00.000Z";
const game = loadFixtureGames("tests/fixtures/sources/games-minimized.csv", NOW).find(
  (item) => item.id === "2026_07_DAL_PHI",
)!;

/** Behaviour every journal must share for game boards. Run against memory and against Neon. */
export function describeGameBoardContract(
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
  const model = () =>
    scriptedModel({
      home: { win: 0.64, loss: 0.36, push: 0 },
      conservativeHome: { win: 0.62, loss: 0.38, push: 0 },
    });

  describe(`${name} game board store`, () => {
    if (isolate?.beforeEach) beforeEach(isolate.beforeEach);
    if (isolate?.afterEach) afterEach(isolate.afterEach);

    it("returns a frozen board and its model pick exactly as they were saved", async () => {
      const store = await makeStore();
      const outcome = await runGameBoard(ask(), { store, collect: quiet, model: model() });
      expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
      if (!outcome.ok) return;
      const saved = await store.getBoard(outcome.board.id);
      expect(saved).toEqual(outcome.board);
      expect(saved?.status).toBe("completed");
      expect(saved?.markets[0]?.pick?.calculation).toMatchObject({
        version: "model-pick-2026-10-27.1",
        pickedSelection: "home",
        grade: "strong",
        release: "unvalidated",
      });
      expect(saved?.markets[0]?.offers[1]).toMatchObject({
        selection: "away",
        americanOdds: 130,
        decimalOdds: 2.3,
        rules: { tie: "push" },
        opposing: { sportsbook: "Board Book", americanOdds: -150 },
      });
    });

    it("returns a three-market board with a model pick and push probability per market", async () => {
      const store = await makeStore();
      const outcome = await runGameBoard(
        ask({
          spread: { homeLine: -3.5, awayLine: 3.5, home: -110, away: -110 },
          total: { overLine: 44.5, underLine: 44.5, over: -105, under: -115 },
        }),
        {
          store,
          collect: quiet,
          model: scriptedModel({ home: { win: 0.55, loss: 0.43, push: 0.02 } }),
        },
      );
      expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
      if (!outcome.ok) return;
      const saved = await store.getBoard(outcome.board.id);
      expect(saved).toEqual(outcome.board);
      expect(saved?.markets.map((market) => market.market)).toEqual([
        "moneyline",
        "spread",
        "total",
      ]);
      expect(saved?.markets[1]?.offers.map((offer) => offer.pointLine)).toEqual([-3.5, 3.5]);
      expect(saved?.markets[2]?.offers.map((offer) => [offer.selection, offer.pointLine])).toEqual([
        ["over", 44.5],
        ["under", 44.5],
      ]);
      for (const market of saved?.markets ?? []) {
        expect(market.pick?.calculation.sides[0].probabilities.push).toBe(0.02);
      }
    });

    it("returns a board without a model pick with its reason", async () => {
      const store = await makeStore();
      const outcome = await runGameBoard(ask(), { store, collect: quiet });
      expect(outcome.ok).toBe(true);
      const saved = await store.getBoard(outcome.board!.id);
      expect(saved).toEqual(outcome.board);
      expect(saved?.markets[0]?.pick).toBeNull();
      expect(saved?.markets[0]?.noPickReason).toBe("No model artifact is configured.");
    });

    it("returns the same board for a repeated submission and rejects changed inputs", async () => {
      const store = await makeStore();
      const source = model();
      const first = await runGameBoard(ask(), { store, collect: quiet, model: source });
      const repeated = await runGameBoard(ask(), { store, collect: quiet, model: source });
      expect(first.ok && repeated.ok).toBe(true);
      expect(repeated.board!.id).toBe(first.board!.id);
      expect(source.offers).toHaveLength(2);

      const conflict = await runGameBoard(
        ask({ moneyline: { home: -155, away: 130, tieRule: "push" } }),
        { store, collect: quiet, model: source },
      );
      expect(conflict.ok).toBe(false);
      expect(conflict.ok ? "" : conflict.error).toMatch(/submission identifier.*different inputs/);
      expect(source.offers).toHaveLength(2);
    });

    it("saves one board for concurrent submissions with one identifier", async () => {
      const store = await makeStore();
      const outcomes = await Promise.all(
        [0, 1, 2].map(() => runGameBoard(ask(), { store, collect: quiet, model: model() })),
      );
      const ids = new Set(outcomes.map((item) => item.board?.id).filter(Boolean));
      expect(ids.size).toBe(1);
      const saved = await store.getBoard([...ids][0]!);
      expect(saved?.status).toBe("completed");
      expect(saved?.markets[0]?.pick).not.toBeNull();
    });

    it("keeps a finished board and its model picks unchanged", async () => {
      const store = await makeStore();
      const outcome = await runGameBoard(ask(), { store, collect: quiet, model: model() });
      const boardId = outcome.board!.id;
      const frozen = await store.getBoard(boardId);
      await expect(
        store.freezeModelPicks({
          boardId,
          evidence: [],
          gaps: ["rewritten"],
          markets: [{ market: "moneyline", noPickReason: "rewritten" }],
        }),
      ).rejects.toThrow();
      const again = await store.finishBoard({
        boardId,
        status: "failed",
        failureReason: "rewritten",
      });
      expect(again).toEqual(frozen);
      expect(await store.getBoard(boardId)).toEqual(frozen);
    });

    it("freezes each market's model pick once while the board is open", async () => {
      const store = await makeStore();
      const begun = await store.beginBoard({
        request: { id: `${scopeOf()}:manual`, hash: "h" },
        parentId: null,
        game: {
          id: game.id,
          season: game.season,
          week: game.week,
          home: game.home,
          away: game.away,
          kickoff: game.kickoff,
          venue: game.venue.name,
        },
        sportsbook: "Board Book",
        observedAt: "2026-10-25T15:30:00.000Z",
        cutoffAt: NOW,
        markets: (await runGameBoard(ask(), { store, collect: quiet })).board!.markets.map(
          ({ market, offers }) => ({ market, offers }),
        ),
      });
      expect(begun.kind).toBe("created");
      if (begun.kind !== "created") return;
      expect(begun.board.status).toBe("pending");
      expect(begun.board.markets[0]?.pick).toBeNull();
      await store.freezeModelPicks({
        boardId: begun.board.id,
        evidence: [],
        gaps: [],
        markets: [{ market: "moneyline", noPickReason: "first" }],
      });
      await expect(
        store.freezeModelPicks({
          boardId: begun.board.id,
          evidence: [],
          gaps: [],
          markets: [{ market: "moneyline", noPickReason: "second" }],
        }),
      ).rejects.toThrow();
      const saved = await store.getBoard(begun.board.id);
      expect(saved?.status).toBe("running");
      expect(saved?.markets[0]?.noPickReason).toBe("first");
    });

    it("keeps game boards out of research analyses", async () => {
      const store = await makeStore();
      await runGameBoard(ask(), { store, collect: quiet, model: model() });
      expect(await store.listCompleted()).toEqual([]);
    });
  });
}
