import { afterEach, expect, it } from "vite-plus/test";
import { createNeonStore } from "#lib/server/analysis/neon-store.ts";
import { createNeonBoardStore } from "#lib/server/analysis/neon-board-store.ts";
import { loadFixtureGames } from "#lib/server/analysis/games.ts";
import { runGameBoard } from "#lib/server/analysis/board-run.ts";
import type { GameBoard, ListedModelPick } from "#lib/server/analysis/board-store.ts";
import { quiet, scriptedModel } from "../board-fixtures.ts";
import { isolatedDb, type IsolatedDb } from "./isolated-db.ts";

let isolated: IsolatedDb | undefined;
afterEach(async () => {
  await isolated?.drop();
});

it("batches complete board graphs, refreshes and own-contract pick grades", async () => {
  isolated = await isolatedDb();
  const db = isolated.db;
  const queries: string[] = [];
  db.options.debug = (_connection, query) => {
    queries.push(query);
  };
  const store = createNeonStore(db);
  const boards = createNeonBoardStore(db);
  const game = loadFixtureGames(
    "tests/fixtures/sources/games-minimized.csv",
    "2026-10-25T16:00:00Z",
  ).find((item) => item.id === "2026_07_DAL_PHI")!;
  const saved: GameBoard[] = [];
  for (let index = 0; index < 4; index++) {
    const outcome = await runGameBoard(
      {
        game,
        nowIso: "2026-10-25T16:00:00Z",
        scheduleRetrievedAt: "2026-10-25T12:00:00Z",
        sportsbook: `Book ${index}`,
        observedAt: "2026-10-25T15:30:00Z",
        moneyline: { home: -150, away: 130, tieRule: "push" },
        spread: { homeLine: -3 - index, awayLine: 3 + index, home: -110, away: -110 },
        total: { overLine: 44.5 + index, underLine: 44.5 + index, over: -105, under: -115 },
        requestId: `board-query-${index}`,
        ...(index ? { parentId: saved[0]!.id } : {}),
      },
      { store, collect: quiet, model: scriptedModel({ home: { win: 0.6, loss: 0.4, push: 0 } }) },
    );
    if (!outcome.ok) throw new Error(outcome.error);
    saved.push(outcome.board!);
  }
  await store.withdrawBoard({ boardId: saved[2]!.id, reason: "Keep history visible" });
  await store.recordGameSettlement({
    eventId: "board-query-final",
    gameId: game.id,
    kind: "final",
    homeScore: 27,
    awayScore: 23,
    recordedAt: "2026-10-27T04:00:00Z",
    source: "official",
  });
  const single = await Promise.all(saved.map((board) => store.getBoard(board.id)));
  const expected: ListedModelPick[] = [];
  for (const board of single) {
    if (!board) throw new Error("Missing board");
    const settlement = await store.readBoardSettlement(board.id);
    for (const market of board.markets) {
      if (!market.pick) continue;
      const grade = settlement.markets.find((item) => item.market === market.market)?.grade;
      if (!grade) throw new Error(`Missing settlement grade for ${market.market}`);
      expected.push({
        pick: market.pick,
        withdrawn: board.withdrawal !== null,
        game: board.game,
        observedAt: board.observedAt,
        offer: market.offers.find(
          (offer) => offer.selection === market.pick!.calculation.pickedSelection,
        )!,
        grade,
      });
    }
  }
  queries.length = 0;
  expect(await store.listModelPicks()).toEqual(expected);
  expect(queries).toHaveLength(6);
  expect(queries.filter((query) => query.includes("FROM settlement_notices"))).toHaveLength(1);
  queries.length = 0;
  expect(await store.listRefreshes(saved[0]!.id)).toEqual(single.slice(1));
  expect(queries).toHaveLength(5);
  queries.length = 0;
  const raw = await boards.readBoards(db);
  expect(queries).toHaveLength(4);
  expect(raw).toHaveLength(4);
  expect(raw.map((board) => board.id)).toEqual(single.map((board) => board!.id));
  expect(raw.every((board) => !("explanationState" in board))).toBe(true);
  const events = await boards.readExplanationEvents(db);
  const { projectBoardExplanation } = await import("#lib/server/analysis/board-explanation.ts");
  expect(
    raw.map((board) =>
      projectBoardExplanation(
        board,
        events.filter((event) => event.boardId === board.id),
      ),
    ),
  ).toEqual(single);
  queries.length = 0;
  expect(await store.listRefreshes(saved[3]!.id)).toEqual([]);
  expect(queries).toHaveLength(1);
});

it("does not query child tables for empty board collections", async () => {
  isolated = await isolatedDb();
  const queries: string[] = [];
  isolated.db.options.debug = (_connection, query) => {
    queries.push(query);
  };
  const store = createNeonBoardStore(isolated.db);
  expect(await store.listModelPicks()).toEqual([]);
  expect(await store.readBoards(isolated.db)).toEqual([]);
  expect(await store.listRefreshes("00000000-0000-0000-0000-000000000001")).toEqual([]);
  expect(queries).toHaveLength(3);
  expect(queries.every((query) => !query.includes("FROM board_markets"))).toBe(true);
});
