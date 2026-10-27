import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { loadFixtureGames } from "#lib/server/analysis/games.ts";
import { runGameBoard } from "#lib/server/analysis/board-run.ts";
import type { JournalStore, NewActualBet } from "#lib/server/analysis/store.ts";
import { quiet, scriptedModel } from "./board-fixtures.ts";

const NOW = "2026-10-25T16:00:00.000Z";
const game = loadFixtureGames("tests/fixtures/sources/games-minimized.csv", NOW).find(
  (item) => item.id === "2026_07_DAL_PHI",
)!;

/** Behaviour every journal must share for an actual bet that references a model pick. */
export function describePickBetContract(
  name: string,
  makeStore: () => JournalStore | Promise<JournalStore>,
  isolate?: { beforeEach?: () => Promise<void>; afterEach?: () => Promise<void> },
) {
  const scope = () => `${name}:${expect.getState().currentTestName ?? "case"}`;

  async function boardWithPick(store: JournalStore) {
    const outcome = await runGameBoard(
      {
        game,
        nowIso: NOW,
        scheduleRetrievedAt: "2026-10-25T12:00:00.000Z",
        sportsbook: "Board Book",
        observedAt: "2026-10-25T15:30:00.000Z",
        moneyline: { home: -150, away: 130, tieRule: "push" },
        requestId: `${scope()}:board`,
      },
      {
        store,
        collect: quiet,
        model: scriptedModel({
          home: { win: 0.64, loss: 0.36, push: 0 },
          conservativeHome: { win: 0.62, loss: 0.38, push: 0 },
        }),
      },
    );
    if (!outcome.ok) throw new Error(outcome.error);
    return outcome.board;
  }

  const placed = (pickId: string, overrides: Partial<NewActualBet> = {}): NewActualBet => ({
    modelPickId: pickId,
    submissionId: `${scope()}:bet`,
    sportsbook: "Corner Book",
    market: "moneyline",
    selection: "home",
    rules: { period: "full-game", overtime: "included", tie: "push" },
    americanOdds: -140,
    stakeUnits: 1,
    placedAt: "2026-10-25T15:45:00.000Z",
    ...overrides,
  });

  describe(`${name} actual bet from a model pick`, () => {
    if (isolate?.beforeEach) beforeEach(isolate.beforeEach);
    if (isolate?.afterEach) afterEach(isolate.afterEach);

    it("keeps the placed odds and the pick reference without changing the board", async () => {
      const store = await makeStore();
      const board = await boardWithPick(store);
      const pick = board.markets[0]!.pick!;
      const result = await store.recordBet(placed(pick.id));
      expect(result.kind).toBe("created");
      if (result.kind !== "created") return;
      expect(result.bet).toMatchObject({
        analysisId: null,
        modelPickId: pick.id,
        contractProvenance: "captured",
        sportsbook: "Corner Book",
        market: "moneyline",
        selection: "home",
        americanOdds: -140,
        stakeUnits: 1,
      });
      expect(await store.listBets()).toEqual([result.bet]);
      expect(await store.getBoard(board.id)).toEqual(board);
    });

    it("returns the same bet for a repeated submission and conflicts on changed terms", async () => {
      const store = await makeStore();
      const pick = (await boardWithPick(store)).markets[0]!.pick!;
      const first = await store.recordBet(placed(pick.id));
      const again = await store.recordBet(placed(pick.id));
      expect(again.kind).toBe("existing");
      if (first.kind === "created" && again.kind === "existing") {
        expect(again.bet.id).toBe(first.bet.id);
      }
      const changed = await store.recordBet(placed(pick.id, { americanOdds: -130 }));
      expect(changed.kind).toBe("conflict");
      expect(await store.listBets()).toHaveLength(1);
    });

    it("rejects a model pick that does not exist", async () => {
      const store = await makeStore();
      await expect(store.recordBet(placed("00000000-0000-4000-8000-000000000000"))).rejects.toThrow(
        /Model pick not found/,
      );
    });

    it("validates the placed contract independently of the pick", async () => {
      const store = await makeStore();
      const pick = (await boardWithPick(store)).markets[0]!.pick!;
      await expect(store.recordBet(placed(pick.id, { americanOdds: -50 }))).rejects.toThrow();
      expect(await store.listBets()).toEqual([]);
    });
  });
}
