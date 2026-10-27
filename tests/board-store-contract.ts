import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { loadFixtureGames } from "#lib/server/analysis/games.ts";
import { runGameBoard, type GameBoardRequest } from "#lib/server/analysis/board-run.ts";
import { runAnalysis } from "#lib/server/analysis/run.ts";
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

    it("returns the private lean and manual evidence beside the board, apart from its model pick", async () => {
      const store = await makeStore();
      const outcome = await runGameBoard(
        ask({
          lean: "Dallas on the road",
          rationale: "Pace of their offense",
          manualEvidence: [
            {
              text: "Club report: no starters out.",
              url: "",
              sourceTime: "2026-10-25T14:00:00.000Z",
              covers: "injury-report",
              team: "PHI",
            },
          ],
        }),
        { store, collect: quiet, model: model() },
      );
      expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
      const saved = await store.getBoard(outcome.board!.id);
      expect(saved).toEqual(outcome.board);
      expect(saved?.lean).toEqual({
        text: "Dallas on the road",
        rationale: "Pace of their offense",
      });
      expect(saved?.evidence.filter((item) => item.origin === "manual")).toHaveLength(1);
      const { lean: _lean, ...rest } = saved!;
      expect(JSON.stringify(rest)).not.toContain("Dallas on the road");
      const without = await runGameBoard(ask({ requestId: "no-lean" }), {
        store,
        collect: quiet,
        model: model(),
      });
      expect((await store.getBoard(without.board!.id))?.lean).toBeNull();
    });

    it("reads a refreshed board back linked to its parent, with the parent unchanged", async () => {
      const store = await makeStore();
      const parent = (
        await runGameBoard(ask({ requestId: "parent" }), {
          store,
          collect: quiet,
          model: model(),
        })
      ).board!;
      const frozen = await store.getBoard(parent.id);
      const child = await runGameBoard(
        ask({
          requestId: "child",
          parentId: parent.id,
          sportsbook: "Later Book",
          observedAt: "2026-10-25T15:45:00.000Z",
          moneyline: { home: -170, away: 150, tieRule: "push" },
        }),
        { store, collect: quiet, model: model() },
      );
      expect(child.ok, child.ok ? "" : child.error).toBe(true);
      const saved = await store.getBoard(child.board!.id);
      expect(saved).toEqual(child.board);
      expect(saved?.id).not.toBe(parent.id);
      expect(saved?.request.id).not.toBe(parent.request.id);
      expect(saved?.parentId).toBe(parent.id);
      expect(saved?.sportsbook).toBe("Later Book");
      expect(saved?.markets[0]?.pick?.parentPickId).toBe(frozen?.markets[0]?.pick?.id);
      expect(await store.getBoard(parent.id)).toEqual(frozen);
      expect(await store.listRefreshes(parent.id)).toEqual([saved]);
      expect(await store.listRefreshes(saved!.id)).toEqual([]);
    });

    it("keeps the parent's manual evidence and private lean in a refresh", async () => {
      const store = await makeStore();
      const deps = { store, collect: quiet, model: model() };
      const parent = (
        await runGameBoard(
          ask({
            requestId: "keep-parent",
            lean: "Dallas on the road",
            rationale: "Pace of their offense",
            manualEvidence: [
              {
                text: "Club report: no starters out.",
                url: "",
                sourceTime: "2026-10-25T14:00:00.000Z",
                covers: "injury-report",
                team: "PHI",
              },
            ],
          }),
          deps,
        )
      ).board!;
      const child = await runGameBoard(
        ask({
          requestId: "keep-child",
          parentId: parent.id,
          sportsbook: "Later Book",
          observedAt: "2026-10-25T15:45:00.000Z",
        }),
        deps,
      );
      expect(child.ok, child.ok ? "" : child.error).toBe(true);
      const saved = await store.getBoard(child.board!.id);
      expect(saved?.lean).toEqual(parent.lean);
      expect(saved?.evidence.filter((item) => item.origin === "manual")).toEqual(
        parent.evidence.filter((item) => item.origin === "manual"),
      );
      expect(saved?.evidence.filter((item) => item.origin === "manual")).toHaveLength(1);
      const own = await runGameBoard(
        ask({
          requestId: "own-lean",
          parentId: parent.id,
          sportsbook: "Third Book",
          observedAt: "2026-10-25T15:50:00.000Z",
          lean: "Philadelphia",
        }),
        deps,
      );
      expect((await store.getBoard(own.board!.id))?.lean).toEqual({
        text: "Philadelphia",
        rationale: "",
      });
    });

    it("rejects a model pick whose parent pick is not the parent board's pick in that market", async () => {
      const store = await makeStore();
      const deps = { store, collect: quiet, model: model() };
      const first = (await runGameBoard(ask({ requestId: "first" }), deps)).board!;
      const second = (await runGameBoard(ask({ requestId: "second" }), deps)).board!;
      const stray = await runGameBoard(ask({ requestId: "stray", parentId: first.id }), deps);
      const template = stray.board!.markets[0]!.pick!;
      const begun = await store.beginBoard({
        request: { id: `${scopeOf()}:forged`, hash: "forged" },
        parentId: first.id,
        game: first.game,
        sportsbook: "Board Book",
        observedAt: "2026-10-25T15:30:00.000Z",
        cutoffAt: NOW,
        markets: first.markets.map(({ market, offers }) => ({ market, offers })),
      });
      if (begun.kind !== "created") throw new Error("expected a created board");
      await expect(
        store.freezeModelPicks({
          boardId: begun.board.id,
          evidence: [],
          gaps: [],
          markets: [
            {
              market: "moneyline",
              pick: {
                parentPickId: second.markets[0]!.pick!.id,
                forecastingModel: template.forecastingModel,
                calculation: template.calculation,
                forecast: null,
              },
            },
          ],
        }),
      ).rejects.toThrow();
      expect((await store.getBoard(begun.board.id))?.markets[0]?.pick).toBeNull();
    });

    describe("settlement", () => {
      const threeMarkets = () =>
        ask({
          spread: { homeLine: -3, awayLine: 3, home: -110, away: -110 },
          total: { overLine: 44.5, underLine: 44.5, over: -105, under: -115 },
        });
      const scripted = () => scriptedModel({ home: { win: 0.55, loss: 0.43, push: 0.02 } });
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
      const frozen = async (store: JournalStore, request = threeMarkets()) => {
        const outcome = await runGameBoard(request, { store, collect: quiet, model: scripted() });
        expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
        return outcome.board!;
      };

      it("grades every model pick from its own contract and keeps the board unchanged", async () => {
        const store = await makeStore();
        const board = await frozen(store);
        expect(board.markets.map((market) => market.pick?.calculation.pickedSelection)).toEqual([
          "away",
          "home",
          "over",
        ]);
        const before = await store.getBoard(board.id);
        const settled = await store.recordGameSettlement(final("final", 24, 21));
        expect(settled.kind).toBe("recorded");
        const read = await store.readBoardSettlement(board.id);
        // 24-21 home win: the away moneyline pick loses, home -3 pushes, 45 combined clears 44.5.
        expect(read.markets.map((item) => [item.market, item.grade?.effective])).toEqual([
          ["moneyline", "loss"],
          ["spread", "push"],
          ["total", "win"],
        ]);
        expect(await store.getBoard(board.id)).toEqual(before);
        expect(await store.listCompleted()).toEqual([]);
      });

      it("grades the same picks differently when the away side wins", async () => {
        const store = await makeStore();
        const board = await frozen(store);
        await store.recordGameSettlement(final("away-wins", 10, 20));
        const read = await store.readBoardSettlement(board.id);
        expect(read.markets.map((item) => item.grade?.effective)).toEqual(["win", "loss", "loss"]);
      });

      it("keeps postponed and unresolved notices unresolved and a void notice void", async () => {
        const store = await makeStore();
        const board = await frozen(store);
        for (const kind of ["postponed", "unresolved"] as const) {
          await store.recordGameSettlement({
            eventId: `${scopeOf()}:${kind}`,
            gameId: game.id,
            kind,
            recordedAt:
              kind === "postponed" ? "2026-10-27T01:00:00.000Z" : "2026-10-27T02:00:00.000Z",
            source: "official",
          });
          const read = await store.readBoardSettlement(board.id);
          expect(read.markets.map((item) => item.grade?.effective)).toEqual([
            "unresolved",
            "unresolved",
            "unresolved",
          ]);
        }
        await store.recordGameSettlement({
          eventId: `${scopeOf()}:void`,
          gameId: game.id,
          kind: "void",
          recordedAt: "2026-10-27T03:00:00.000Z",
          source: "official",
        });
        const read = await store.readBoardSettlement(board.id);
        expect(read.markets.map((item) => item.grade?.effective)).toEqual(["void", "void", "void"]);
      });

      it("regrades on a correction that names the earlier notice and keeps the history", async () => {
        const store = await makeStore();
        const board = await frozen(store);
        const first = await store.recordGameSettlement(final("first", 24, 21));
        if (first.kind !== "recorded") throw new Error("expected a recorded notice");
        const noReason = await store.recordGameSettlement(
          final("fix-no-reason", 24, 20, {
            correctsNoticeId: first.noticeId,
            recordedAt: "2026-10-27T05:00:00.000Z",
          }),
        );
        expect(noReason).toMatchObject({
          kind: "conflict",
          error: expect.stringMatching(/reason/i),
        });
        const fixed = await store.recordGameSettlement(
          final("fix", 24, 20, {
            correctsNoticeId: first.noticeId,
            reason: "Official score changed",
            recordedAt: "2026-10-27T05:00:00.000Z",
          }),
        );
        if (fixed.kind !== "recorded") throw new Error("expected a recorded correction");
        const read = await store.readBoardSettlement(board.id);
        expect(read.markets.map((item) => item.grade?.effective)).toEqual(["loss", "win", "loss"]);
        expect(read.markets[1]?.grade?.history).toMatchObject([
          { id: first.noticeId, result: "push", correctsId: null },
          { id: fixed.noticeId, result: "win", correctsId: first.noticeId },
        ]);
        await expect(
          store.recordGameSettlement(
            final("missing", 1, 0, {
              correctsNoticeId: "00000000-0000-4000-8000-000000000000",
              reason: "x",
            }),
          ),
        ).rejects.toThrow();
      });

      it("keys a notice to the game, so every board of the game gets one grade per event", async () => {
        const store = await makeStore();
        const first = await frozen(store);
        const second = await frozen(store, {
          ...threeMarkets(),
          requestId: `${scopeOf()}:second-board`,
        });
        expect(second.id).not.toBe(first.id);
        const input = final("shared", 24, 21);
        const recorded = await store.recordGameSettlement(input);
        expect(recorded.kind).toBe("recorded");
        expect(await store.recordGameSettlement(input)).toEqual(
          recorded.kind === "recorded"
            ? { kind: "duplicate", noticeId: recorded.noticeId }
            : recorded,
        );
        expect(await store.recordGameSettlement({ ...input, homeScore: 3 })).toMatchObject({
          kind: "conflict",
          error: expect.stringMatching(/different inputs/i),
        });
        for (const board of [first, second]) {
          const read = await store.readBoardSettlement(board.id);
          expect(read.markets.map((item) => item.grade?.effective)).toEqual([
            "loss",
            "push",
            "win",
          ]);
          expect(read.markets[0]?.grade?.history).toHaveLength(1);
        }
      });

      it("never lets an analysis notice and a game notice share an event identifier", async () => {
        const store = await makeStore();
        await frozen(store);
        const run = (
          await runAnalysis(
            {
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
              requestId: `${scopeOf()}:analysis`,
            },
            { store },
          )
        ).run!;
        const eventId = `${scopeOf()}:shared-event`;
        const analysis = await store.recordSettlement({
          eventId,
          analysisId: run.id,
          kind: "final",
          homeScore: 24,
          awayScore: 21,
          recordedAt: "2026-10-27T04:00:00.000Z",
          source: "official",
        });
        expect(analysis.kind).toBe("recorded");
        expect(await store.recordGameSettlement({ ...final("x", 24, 21), eventId })).toMatchObject({
          kind: "conflict",
        });
        const read = await store.readSettlement({ analysisId: run.id });
        expect(read.assessment.history).toHaveLength(1);
      });

      it("rejects a notice for a game that has no board", async () => {
        const store = await makeStore();
        await expect(
          store.recordGameSettlement({ ...final("nobody", 1, 0), gameId: "2026_99_AAA_BBB" }),
        ).rejects.toThrow(/game/i);
      });

      it("shows a market without a model pick as ungraded", async () => {
        const store = await makeStore();
        const outcome = await runGameBoard(ask(), { store, collect: quiet });
        await store.recordGameSettlement(final("nopick", 24, 21));
        const read = await store.readBoardSettlement(outcome.board!.id);
        expect(read.markets).toEqual([{ market: "moneyline", pick: null, grade: null }]);
      });
    });

    it("keeps game boards out of research analyses", async () => {
      const store = await makeStore();
      await runGameBoard(ask(), { store, collect: quiet, model: model() });
      expect(await store.listCompleted()).toEqual([]);
    });
  });
}
