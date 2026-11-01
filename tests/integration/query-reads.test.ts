import { afterEach, expect, it } from "vite-plus/test";
import { createNeonStore } from "#lib/server/analysis/neon-store.ts";
import { JournalRepository } from "#lib/server/db/repository.ts";
import { isolatedDb, type IsolatedDb } from "./isolated-db.ts";
import { loadFixtureGames } from "#lib/server/analysis/games.ts";
import { runGameBoard } from "#lib/server/analysis/board-run.ts";
import { quiet, scriptedModel } from "../board-fixtures.ts";
import { lifecycleInput } from "../board-explanation-contract.ts";

let isolated: IsolatedDb | undefined;
afterEach(async () => {
  await isolated?.drop();
});

it("exports explanation events in the complete snapshot and restores them atomically", async () => {
  isolated = await isolatedDb();
  const store = createNeonStore(isolated.db);
  const begun = await store.beginBoard(lifecycleInput("query-backup"));
  if (begun.kind === "conflict") throw new Error(begun.error);
  await store.completeBoardForecast({
    boardId: begun.board.id,
    evidence: [],
    gaps: [],
    markets: [{ market: "moneyline", noPickReason: "Unavailable" }],
  });
  await store.beginBoardExplanation({
    boardId: begun.board.id,
    attemptId: "query-explanation",
    drafter: { id: "fixture", modelId: "test" },
  });
  const backup = await store.exportJournal();
  expect(backup.explanationEvents).toHaveLength(1);
  expect(backup.explanationEvents![0]!.boardId).toBe(begun.board.id);
  expect(await store.restoreJournal(backup)).toEqual(backup);
});

it("returns no closing records in an empty journal", async () => {
  isolated = await isolatedDb();
  expect(await createNeonStore(isolated.db).listClosings()).toEqual([]);
});

it("uses the selected executable offer for pick contracts and closing comparisons", async () => {
  isolated = await isolatedDb();
  const store = createNeonStore(isolated.db);
  const repository = new JournalRepository(isolated.db);
  const game = loadFixtureGames(
    "tests/fixtures/sources/games-minimized.csv",
    "2026-10-25T16:00:00Z",
  ).find((item) => item.id === "2026_07_DAL_PHI")!;
  const outcome = await runGameBoard(
    {
      game,
      nowIso: "2026-10-25T16:00:00Z",
      scheduleRetrievedAt: "2026-10-25T12:00:00Z",
      sportsbook: "Anchor Book",
      observedAt: "2026-10-25T15:00:00.000Z",
      moneyline: { home: -150, away: 130, tieRule: "push" },
      extraQuotes: [
        {
          sportsbook: "Shop Book",
          market: "moneyline",
          selection: "home",
          pointLine: null,
          americanOdds: -135,
          observedAt: "2026-10-25T15:30:00.000Z",
        },
      ],
      requestId: "query-executable-offer",
    },
    { store, collect: quiet, model: scriptedModel({ home: { win: 0.6, loss: 0.4, push: 0 } }) },
  );
  expect(outcome.ok).toBe(true);
  const pickId = outcome.board!.markets[0]!.pick!.id;
  const expected = {
    sportsbook: "Shop Book",
    observedAt: "2026-10-25T15:30:00.000Z",
    americanOdds: -135,
    market: "moneyline",
    selection: "home",
    pointLine: null,
  };
  expect(await repository.findPickContract(pickId)).toMatchObject(expected);
  expect((await repository.findPickContracts([pickId, pickId])).get(pickId)).toMatchObject(
    expected,
  );
  for (const sportsbook of ["Shop Book", "Anchor Book"]) {
    await store.recordClosing({
      subject: { kind: "model-pick", id: pickId },
      sportsbook,
      market: "moneyline",
      selection: "home",
      rules: { period: "full-game", overtime: "included", tie: "push" },
      americanOdds: -160,
      observedAt: "2026-10-25T16:30:00Z",
      source: "query-fixture",
    });
  }
  const closings = await store.listClosings();
  expect(closings).toHaveLength(2);
  expect(closings.find((row) => row.sportsbook === "Shop Book")!.comparison).toMatchObject({
    available: true,
    openDecimal: 1 + 100 / 135,
  });
  expect(closings.find((row) => row.sportsbook === "Anchor Book")!.comparison).toEqual({
    available: false,
    reason: "different-contract",
  });
});

it("preserves pick closing identities across multiple boards without hydrating unrelated records", async () => {
  isolated = await isolatedDb();
  const store = createNeonStore(isolated.db);
  const game = loadFixtureGames(
    "tests/fixtures/sources/games-minimized.csv",
    "2026-10-25T16:00:00Z",
  ).find((item) => item.id === "2026_07_DAL_PHI")!;
  const ids: string[] = [];
  for (let index = 0; index < 3; index++) {
    const outcome = await runGameBoard(
      {
        game,
        nowIso: "2026-10-25T16:00:00Z",
        scheduleRetrievedAt: "2026-10-25T12:00:00Z",
        sportsbook: "Board Book",
        observedAt: "2026-10-25T15:30:00Z",
        moneyline: { home: -150, away: 130, tieRule: "push" },
        requestId: `query-board-${index}`,
      },
      { store, collect: quiet, model: scriptedModel({ home: { win: 0.6, loss: 0.4, push: 0 } }) },
    );
    expect(outcome.ok).toBe(true);
    ids.push(outcome.board!.markets[0]!.pick!.id);
  }
  const contracts = await new JournalRepository(isolated.db).findPickContracts([
    ids[0]!,
    ids[2]!,
    ids[0]!,
  ]);
  expect([...contracts.keys()].sort()).toEqual([ids[0], ids[2]].sort());
  for (const id of [ids[0]!, ids[2]!]) {
    const contract = contracts.get(id)!;
    await store.recordClosing({
      subject: { kind: "model-pick", id },
      sportsbook: contract.sportsbook,
      market: contract.market,
      selection: contract.selection,
      pointLine: contract.pointLine ?? undefined,
      rules: contract.rules,
      americanOdds: -160,
      observedAt: "2026-10-25T16:30:00Z",
      source: "query-fixture",
    });
  }
  const closings = await store.listClosings();
  expect(closings.map((row) => row.subject.id).sort()).toEqual([ids[0], ids[2]].sort());
  expect(closings.every((row) => row.comparison.available)).toBe(true);
  expect(new Set(closings.map((row) => row.id)).size).toBe(2);
});

it("returns only referenced frozen analysis contracts and nothing for empty references", async () => {
  isolated = await isolatedDb();
  const repository = new JournalRepository(isolated.db);
  expect(await repository.findClosingAnalysisContracts([])).toEqual(new Map());
  expect(
    await repository.findClosingAnalysisContracts(["00000000-0000-0000-0000-000000000001"]),
  ).toEqual(new Map());
  expect(await repository.findPickContracts([])).toEqual(new Map());
  const saved = await repository.saveCompletedAnalysis({
    game: {
      sourceGameId: "query-analysis",
      season: 2026,
      week: 9,
      awayTeam: "DAL",
      homeTeam: "PHI",
      kickoffAt: "2026-11-08T18:00:00Z",
      venue: null,
      status: "scheduled",
    },
    offer: {
      gameId: "pending",
      sportsbook: "research",
      market: "spread",
      selection: "home",
      pointLine: -3,
      americanOdds: -110,
      observedAt: "2026-11-01T15:00:00Z",
      enteredAt: "2026-11-01T15:00:00Z",
      kickoffAt: "2026-11-08T18:00:00Z",
      opposing: null,
      rules: { period: "full-game", overtime: "included", tie: null },
    },
    evidence: [],
    analysis: { cutoffAt: "2026-11-01T15:00:00Z", status: "completed", conclusion: "pass" },
  });
  const bet = await repository.recordBet({
    analysisId: saved.analysis.id,
    offerId: saved.offer.id,
    contract: { market: "spread", selection: "home", pointLine: -3.5, rules: saved.offer.rules },
    americanOdds: 120,
    placedAt: "2026-11-01T15:10:00Z",
    stakeUnits: 2,
    sportsbook: "placed",
  });
  const contracts = await repository.findClosingAnalysisContracts([
    saved.analysis.id,
    saved.analysis.id,
  ]);
  const summaries = await repository.listCompletedSummaries();
  expect(summaries.find((row) => row.id === saved.analysis.id)?.frozenOffer).toEqual(
    saved.analysis.snapshot.offer,
  );
  expect(summaries.find((row) => row.id === saved.analysis.id)?.frozenForecast).toBeNull();
  expect(contracts.size).toBe(1);
  expect(contracts.get(saved.analysis.id)).toMatchObject({
    sportsbook: "research",
    pointLine: -3,
    americanOdds: -110,
    gameId: "query-analysis",
    kickoffAt: saved.analysis.snapshot.game.kickoffAt,
  });
  const bets = await repository.findClosingBets([bet.id, bet.id]);
  expect(bets).toEqual([bet]);
  expect(bets[0]!.contract?.pointLine).toBe(-3.5);
});
