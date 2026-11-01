import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { runGameBoard, type GameBoardRequest } from "../../src/lib/server/analysis/board-run.ts";
import { parseOffer } from "../../src/lib/domain/offer.ts";
import { loadFixtureGames } from "../../src/lib/server/analysis/games.ts";
import { createNeonStore } from "../../src/lib/server/analysis/neon-store.ts";
import { runAnalysis, type AnalysisRequest } from "../../src/lib/server/analysis/run.ts";
import type { Db } from "../../src/lib/server/db/client.ts";
import { PROSPECTIVE_PROTOCOL } from "../../src/lib/server/models/release.ts";
import { quiet, scriptedModel } from "../board-fixtures.ts";
import { isolatedDb, type IsolatedDb } from "./isolated-db.ts";

const NOW = "2026-10-25T16:00:00.000Z";
const games = loadFixtureGames("tests/fixtures/sources/games-minimized.csv", NOW);
const dalPhi = games.find((item) => item.id === "2026_07_DAL_PHI")!;
const gbDet = games.find((item) => item.id === "2026_07_GB_DET")!;

const open: IsolatedDb[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((item) => item.drop()));
});

async function concurrentStore() {
  const isolated = await isolatedDb({ connections: 6 });
  open.push(isolated);
  return { db: isolated.db, store: createNeonStore(isolated.db) };
}

function analysis(requestId: string, overrides: Partial<AnalysisRequest> = {}): AnalysisRequest {
  return {
    game: dalPhi,
    nowIso: NOW,
    scheduleRetrievedAt: "2026-10-25T12:00:00.000Z",
    sportsbook: "Example Book",
    market: "moneyline",
    selection: "home",
    americanOdds: -110,
    observedAt: "2026-10-25T15:30:00.000Z",
    tieRule: "push",
    requestId,
    ...overrides,
  };
}

function board(requestId: string, overrides: Partial<GameBoardRequest> = {}): GameBoardRequest {
  return {
    game: dalPhi,
    nowIso: NOW,
    scheduleRetrievedAt: "2026-10-25T12:00:00.000Z",
    sportsbook: "Board Book",
    observedAt: "2026-10-25T15:30:00.000Z",
    moneyline: { home: -150, away: 130, tieRule: "push" },
    requestId,
    ...overrides,
  };
}

const model = () => scriptedModel({ home: { win: 0.55, loss: 0.43, push: 0.02 } });

async function lockWaiters(db: Db): Promise<number> {
  const [row] = await db<{ waiting: number }[]>`
    SELECT count(*)::int AS waiting FROM pg_stat_activity
    WHERE application_name = current_setting('application_name') AND wait_event_type = 'Lock'
  `;
  return row!.waiting;
}

/**
 * Holds a table lock that both completions need before they can commit, starts them, and releases
 * the lock only once both transactions are waiting. Both are then inside their completion
 * transaction at the same time, whatever the scheduler would otherwise have done.
 */
async function overlapping<T>(db: Db, lock: string, work: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let held!: () => void;
  const locked = new Promise<void>((resolve) => (held = resolve));
  const holder = db.begin(async (tx) => {
    await tx.unsafe(lock);
    held();
    await released;
  });
  await locked;
  const running = work();
  let settled = false;
  void running.finally(() => (settled = true)).catch(() => {});
  const deadline = Date.now() + 10_000;
  while (!settled && Date.now() < deadline && (await lockWaiters(db)) < 2) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const bothWaited = (await lockWaiters(db)) >= 2;
  release();
  await holder;
  expect(bothWaited, "both completions were inside their transactions together").toBe(true);
  return running;
}

describe("concurrent completion", () => {
  it("gives two analyses of one game completing together one primary and keeps both readable", async () => {
    const { db, store } = await concurrentStore();
    const outcomes = await overlapping(db, "LOCK TABLE reports IN SHARE MODE", () =>
      Promise.allSettled([
        runAnalysis(analysis("same-game-a", { sportsbook: "Book A" }), { store }),
        runAnalysis(analysis("same-game-b", { sportsbook: "Book B" }), { store }),
      ]),
    );
    expect(
      outcomes.map((item) =>
        item.status === "rejected"
          ? String(item.reason)
          : item.value.ok
            ? "completed"
            : item.value.error,
      ),
    ).toEqual(["completed", "completed"]);
    const ids = outcomes.map((item) => (item.status === "fulfilled" ? item.value.run!.id : ""));
    const runs = await Promise.all(ids.map((id) => store.getRun(id)));
    expect(runs.map((run) => run?.status)).toEqual(["completed", "completed"]);
    const roles = runs.map((run) => run!.assessmentRole!);
    expect(roles.map((role) => role.role).sort()).toEqual(["primary", "refresh"]);
    const primary = runs.find((run) => run!.assessmentRole!.role === "primary")!;
    const refresh = runs.find((run) => run!.assessmentRole!.role === "refresh")!;
    expect(refresh.assessmentRole).toMatchObject({ primaryId: primary.id });
    expect(Date.parse(primary.completedAt!)).toBeLessThan(Date.parse(refresh.completedAt!));
  });

  it("gives two boards of one game completing together one primary pick per market", async () => {
    const { db, store } = await concurrentStore();
    const outcomes = await overlapping(db, "LOCK TABLE model_pick_roles IN SHARE MODE", () =>
      Promise.allSettled([
        runGameBoard(board("same-game-a", { sportsbook: "Book A" }), {
          store,
          collect: quiet,
          model: model(),
        }),
        runGameBoard(board("same-game-b", { sportsbook: "Book B" }), {
          store,
          collect: quiet,
          model: model(),
        }),
      ]),
    );
    expect(
      outcomes.map((item) =>
        item.status === "rejected"
          ? String(item.reason)
          : item.value.ok
            ? "completed"
            : item.value.error,
      ),
    ).toEqual(["completed", "completed"]);
    const boards = await Promise.all(
      outcomes.map((item) =>
        store.getBoard(item.status === "fulfilled" ? item.value.board!.id : ""),
      ),
    );
    expect(boards.map((item) => item?.status)).toEqual(["completed", "completed"]);
    const roles = boards.map((item) => item!.markets[0]!.pick!.role);
    expect(roles.map((role) => role.role).sort()).toEqual(["primary", "refresh"]);
    const primaryBoard = boards.find((item) => item!.markets[0]!.pick!.role.role === "primary")!;
    expect(roles.find((role) => role.role === "refresh")).toMatchObject({
      primaryPickId: primaryBoard.markets[0]!.pick!.id,
    });
  });

  it("lets analyses and boards of different games each become primary together", async () => {
    const { store } = await concurrentStore();
    const [left, right, leftBoard, rightBoard] = await Promise.all([
      runAnalysis(analysis("dal-phi"), { store }),
      runAnalysis(analysis("gb-det", { game: gbDet }), { store }),
      runGameBoard(board("dal-phi-board"), { store, collect: quiet, model: model() }),
      runGameBoard(board("gb-det-board", { game: gbDet }), {
        store,
        collect: quiet,
        model: model(),
      }),
    ]);
    expect([left.run?.assessmentRole?.role, right.run?.assessmentRole?.role]).toEqual([
      "primary",
      "primary",
    ]);
    expect([leftBoard, rightBoard].map((item) => item.board?.markets[0]?.pick?.role.role)).toEqual([
      "primary",
      "primary",
    ]);
  });
});

describe("frozen protocol records", () => {
  it("rejects changing or deleting a registration or closing market snapshot and accepts new ones", async () => {
    const isolated = await isolatedDb();
    open.push(isolated);
    const store = createNeonStore(isolated.db);
    await runAnalysis(analysis("closing-game"), { store });
    const registration = await store.recordProtocolRegistration({
      id: "registration-frozen",
      cohort: "primary-model-picks",
      protocol: { ...PROSPECTIVE_PROTOCOL, artifactChecksum: "f".repeat(64) },
    });
    const quote = (selection: "home" | "away") =>
      parseOffer({
        gameId: dalPhi.id,
        sportsbook: "Close Book",
        market: "moneyline",
        selection,
        americanOdds: selection === "home" ? -140 : 120,
        observedAt: "2026-10-25T20:05:00.000Z",
        kickoffAt: dalPhi.kickoff,
        rules: { period: "full-game", overtime: "included", tie: "push" },
      });
    const snapshot = await store.recordClosingMarketSnapshot({
      id: "closing-frozen",
      gameId: dalPhi.id,
      market: "moneyline",
      offers: [quote("home"), quote("away")],
      observedAt: "2026-10-25T20:05:00.000Z",
      source: "book",
    });
    const db = isolated.db;
    await expect(
      db`UPDATE protocol_registrations SET payload = payload || '{"cohort":"x"}' WHERE id = ${registration.id}`,
    ).rejects.toThrow(/append-only/);
    await expect(
      db`DELETE FROM protocol_registrations WHERE id = ${registration.id}`,
    ).rejects.toThrow(/append-only/);
    await expect(
      db`UPDATE closing_market_snapshots SET payload = '{}'::jsonb WHERE id = ${snapshot.id}`,
    ).rejects.toThrow(/append-only/);
    await expect(
      db`DELETE FROM closing_market_snapshots WHERE id = ${snapshot.id}`,
    ).rejects.toThrow(/append-only/);
    expect(await store.listProtocolRegistrations()).toEqual([registration]);
    expect(await store.listClosingMarketSnapshots()).toEqual([snapshot]);

    const second = await store.recordProtocolRegistration({
      id: "registration-second",
      cohort: "primary-model-picks",
      protocol: { ...PROSPECTIVE_PROTOCOL, artifactChecksum: "e".repeat(64) },
    });
    expect(await store.listProtocolRegistrations()).toEqual([registration, second]);
  });

  it("refuses a board that names a missing registration", async () => {
    const isolated = await isolatedDb();
    open.push(isolated);
    const store = createNeonStore(isolated.db);
    const begun = await store.beginBoard({
      request: { id: "unregistered", hash: "unregistered" },
      parentId: null,
      game: (await runGameBoard(board("template"), { store, collect: quiet, model: model() }))
        .board!.game,
      sportsbook: "Board Book",
      observedAt: "2026-10-25T15:00:00.000Z",
      cutoffAt: "2026-10-25T15:30:00.000Z",
      markets: [],
    });
    if (begun.kind !== "created") throw new Error("expected a new board");
    await expect(
      isolated.db`UPDATE game_boards SET protocol_registration_id = 'missing' WHERE id = ${begun.board.id}`,
    ).rejects.toThrow(/game_boards_protocol_registration/);
  });

  it("stops the migration on a board naming a missing registration and leaves the reference", async () => {
    const isolated = await isolatedDb({ throughMigration: "024_board_explanation_format.sql" });
    open.push(isolated);
    const store = createNeonStore(isolated.db);
    const template = (
      await runGameBoard(board("template"), { store, collect: quiet, model: model() })
    ).board!;
    const begun = await store.beginBoard({
      request: { id: "dangling", hash: "dangling" },
      parentId: null,
      game: template.game,
      sportsbook: "Board Book",
      observedAt: "2026-10-25T15:00:00.000Z",
      cutoffAt: "2026-10-25T15:30:00.000Z",
      markets: [],
    });
    if (begun.kind !== "created") throw new Error("expected a new board");
    await isolated.db`
      UPDATE game_boards SET protocol_registration_id = 'deleted-registration'
      WHERE id = ${begun.board.id}
    `;
    const migration = await readFile(
      path.resolve("migrations/025_frozen_protocol_records.sql"),
      "utf8",
    );
    await expect(isolated.db.unsafe(migration)).rejects.toThrow(
      new RegExp(`${begun.board.id}.*deleted-registration`),
    );
    const [row] = await isolated.db<{ protocol_registration_id: string }[]>`
      SELECT protocol_registration_id FROM game_boards WHERE id = ${begun.board.id}
    `;
    expect(row?.protocol_registration_id).toBe("deleted-registration");
    await expect(
      isolated.db`DELETE FROM game_boards WHERE id = ${begun.board.id} RETURNING id`,
    ).resolves.toHaveLength(1);
    await isolated.db.unsafe(migration);
  });
});
