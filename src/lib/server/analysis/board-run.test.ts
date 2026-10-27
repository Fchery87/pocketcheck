import { describe, expect, it } from "vite-plus/test";
import { loadFixtureGames } from "#lib/server/analysis/games.ts";
import { runGameBoard, type GameBoardRequest } from "#lib/server/analysis/board-run.ts";
import { createMemoryStore } from "#lib/server/analysis/store.ts";
import type { ModelSource } from "#lib/server/analysis/model.ts";
import type { OutcomeProbabilities } from "#lib/domain/odds.ts";
import { quiet, scriptedModel } from "../../../../tests/board-fixtures.ts";

const NOW = "2026-10-25T16:00:00.000Z";
const game = loadFixtureGames("tests/fixtures/sources/games-minimized.csv", NOW).find(
  (item) => item.id === "2026_07_DAL_PHI",
)!;

function board(overrides: Partial<GameBoardRequest> = {}): GameBoardRequest {
  return {
    game,
    nowIso: NOW,
    sportsbook: "Board Book",
    observedAt: "2026-10-25T15:30:00.000Z",
    moneyline: { home: -150, away: 130, tieRule: "push" },
    ...overrides,
  };
}

describe("game board run", () => {
  it("freezes a moneyline board and its unvalidated model pick", async () => {
    const store = createMemoryStore();
    const model = scriptedModel({
      home: { win: 0.62, loss: 0.36, push: 0.02 },
    });
    const outcome = await runGameBoard(board({ requestId: "board-1" }), {
      store,
      collect: quiet,
      model,
    });
    expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
    if (!outcome.ok) return;
    const saved = await store.getBoard(outcome.board.id);
    expect(saved).toEqual(outcome.board);
    expect(saved).toMatchObject({
      status: "completed",
      sportsbook: "Board Book",
      observedAt: "2026-10-25T15:30:00.000Z",
      cutoffAt: NOW,
      game: { id: "2026_07_DAL_PHI", home: "PHI", away: "DAL" },
      request: { id: "board-1" },
      parentId: null,
    });
    expect(saved!.completedAt).not.toBeNull();
    expect(saved!.markets).toHaveLength(1);
    const [moneyline] = saved!.markets;
    expect(moneyline.market).toBe("moneyline");
    expect(moneyline.offers.map((offer) => [offer.selection, offer.americanOdds])).toEqual([
      ["home", -150],
      ["away", 130],
    ]);
    expect(moneyline.offers[0].opposing).toMatchObject({ americanOdds: 130 });
    expect(moneyline.offers[1].opposing).toMatchObject({ americanOdds: -150 });
    expect(moneyline.offers[0].rules.tie).toBe("push");
    expect(moneyline.noPickReason).toBeNull();

    const pick = moneyline.pick!;
    expect(pick.boardId).toBe(saved!.id);
    expect(pick.parentPickId).toBeNull();
    expect(pick.forecastingModel.checksum).toBe("f".repeat(64));
    const calculation = pick.calculation;
    expect(calculation.version).toBe("model-pick-2026-10-27.1");
    expect(calculation.pickedSelection).toBe("home");
    expect(calculation.grade).toBe("lean");
    expect(calculation.release).toBe("unvalidated");
    expect(calculation.margin).toBeCloseTo(0.034783, 6);
    const [home, away] = calculation.sides;
    expect(home.selection).toBe("home");
    expect(home.probabilities).toEqual({ win: 0.62, loss: 0.36, push: 0.02 });
    expect(away.probabilities).toEqual({ win: 0.36, loss: 0.62, push: 0.02 });
    expect(home.noVigProbability).toBeCloseTo(0.579832, 6);
    expect(away.noVigProbability).toBeCloseTo(0.420168, 6);
    expect(home.expectedValue).toBeCloseTo(0.053333, 6);
    expect(away.expectedValue).toBeCloseTo(-0.152, 6);
    expect(home.conservativeExpectedValue).toBeNull();
    expect(calculation.priceCutoff).toMatchObject({
      available: true,
      grade: "lean",
      keeps: true,
      americanOdds: -172,
    });
    if (calculation.priceCutoff.available) {
      expect(calculation.priceCutoff.decimalOdds).toBeCloseTo(1.580645, 6);
    }
  });
});

describe("spread and total game boards", () => {
  const spread = { homeLine: -3.5, awayLine: 3.5, home: -110, away: -110 };
  const total = { overLine: 44.5, underLine: 44.5, over: -105, under: -115 };
  const model = () => scriptedModel({ home: { win: 0.55, loss: 0.43, push: 0.02 } });

  it("freezes one model pick per entered market of a three-market board", async () => {
    const store = createMemoryStore();
    const outcome = await runGameBoard(board({ requestId: "three", spread, total }), {
      store,
      collect: quiet,
      model: model(),
    });
    expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
    if (!outcome.ok) return;
    const saved = (await store.getBoard(outcome.board.id))!;
    expect(saved.markets.map((market) => market.market)).toEqual(["moneyline", "spread", "total"]);
    for (const market of saved.markets) expect(market.pick).not.toBeNull();
    const [, spreadMarket, totalMarket] = saved.markets;
    expect(spreadMarket.offers.map((offer) => [offer.selection, offer.pointLine])).toEqual([
      ["home", -3.5],
      ["away", 3.5],
    ]);
    expect(totalMarket.offers.map((offer) => [offer.selection, offer.pointLine])).toEqual([
      ["over", 44.5],
      ["under", 44.5],
    ]);
    expect(totalMarket.pick!.calculation.sides.map((side) => side.selection)).toEqual([
      "over",
      "under",
    ]);
    expect(spreadMarket.pick!.calculation.sides[0].probabilities.push).toBe(0.02);
  });

  it.each([
    ["spread only", { moneyline: undefined, spread }, ["spread"]],
    ["total only", { moneyline: undefined, total }, ["total"]],
    ["spread and total", { moneyline: undefined, spread, total }, ["spread", "total"]],
    ["moneyline and total", { total }, ["moneyline", "total"]],
  ])("yields a model pick for each entered market: %s", async (_name, overrides, markets) => {
    const store = createMemoryStore();
    const outcome = await runGameBoard(board({ requestId: "subset", ...overrides }), {
      store,
      collect: quiet,
      model: model(),
    });
    expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.board.markets.map((market) => market.market)).toEqual(markets);
    expect(outcome.board.markets.every((market) => market.pick !== null)).toBe(true);
  });
});

describe("model pick strength grades", () => {
  type Case = {
    name: string;
    prices: { home: number; away: number };
    home: OutcomeProbabilities;
    conservativeHome?: OutcomeProbabilities;
    conservativeAway?: OutcomeProbabilities;
    released?: boolean;
    materialGap?: boolean;
    expected: {
      picked: "home" | "away";
      grade: "strong" | "lean" | "no edge";
      tieBreak: "expected value" | "model win probability" | "home or over";
      release?: "released" | "unvalidated";
      cutoff?: {
        grade: "strong" | "lean";
        keeps: boolean;
        americanOdds: number;
      };
    };
  };
  const cases: Case[] = [
    {
      name: "strong when the conservative expected value clears the threshold",
      prices: { home: -110, away: -110 },
      home: { win: 0.56, loss: 0.44, push: 0 },
      conservativeHome: { win: 0.53, loss: 0.47, push: 0 },
      expected: {
        picked: "home",
        grade: "strong",
        tieBreak: "expected value",
        cutoff: { grade: "strong", keeps: true, americanOdds: -113 },
      },
    },
    {
      name: "strong just above the threshold",
      prices: { home: 100, away: 100 },
      home: { win: 0.55, loss: 0.45, push: 0 },
      conservativeHome: { win: 0.51, loss: 0.49, push: 0 },
      expected: { picked: "home", grade: "strong", tieBreak: "expected value" },
    },
    {
      name: "lean when the conservative expected value equals the threshold",
      prices: { home: 100, away: 100 },
      home: { win: 0.55, loss: 0.45, push: 0 },
      conservativeHome: { win: 0.5, loss: 0.5, push: 0 },
      expected: {
        picked: "home",
        grade: "lean",
        tieBreak: "expected value",
        cutoff: { grade: "lean", keeps: true, americanOdds: -122 },
      },
    },
    {
      name: "lean, not strong, while material evidence is missing",
      prices: { home: 100, away: 100 },
      home: { win: 0.55, loss: 0.45, push: 0 },
      conservativeHome: { win: 0.51, loss: 0.49, push: 0 },
      materialGap: true,
      expected: { picked: "home", grade: "lean", tieBreak: "expected value" },
    },
    {
      name: "no edge names the less bad side and the price that would make it a lean",
      prices: { home: -110, away: -110 },
      home: { win: 0.51, loss: 0.49, push: 0 },
      expected: {
        picked: "home",
        grade: "no edge",
        tieBreak: "expected value",
        cutoff: { grade: "lean", keeps: false, americanOdds: -104 },
      },
    },
    {
      name: "the away side when it has the higher expected value",
      prices: { home: -200, away: 170 },
      home: { win: 0.6, loss: 0.4, push: 0 },
      expected: { picked: "away", grade: "lean", tieBreak: "expected value" },
    },
    {
      name: "an expected value tie goes to the higher model win probability",
      prices: { home: 200, away: -200 },
      home: { win: 0.3, loss: 0.6, push: 0.1 },
      expected: {
        picked: "away",
        grade: "no edge",
        tieBreak: "model win probability",
      },
    },
    {
      name: "a full tie goes to home graded no edge",
      prices: { home: 100, away: 100 },
      home: { win: 0.4, loss: 0.4, push: 0.2 },
      expected: { picked: "home", grade: "no edge", tieBreak: "home or over" },
    },
    {
      name: "a released market reads released",
      prices: { home: -110, away: -110 },
      home: { win: 0.56, loss: 0.44, push: 0 },
      released: true,
      expected: {
        picked: "home",
        grade: "lean",
        tieBreak: "expected value",
        release: "released",
      },
    },
  ];

  for (const item of cases) {
    it(item.name, async () => {
      const outcome = await runGameBoard(
        board({ moneyline: { ...item.prices, tieRule: "push" } }),
        {
          store: createMemoryStore(),
          collect: item.materialGap
            ? async () => ({
                items: [],
                gaps: ["Weather was not collected."],
                materialGaps: [{ kind: "weather", text: "Weather was not collected." }],
              })
            : quiet,
          model: scriptedModel(item),
        },
      );
      expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
      const calculation = outcome.board!.markets[0].pick!.calculation;
      expect(calculation.pickedSelection).toBe(item.expected.picked);
      expect(calculation.grade).toBe(item.expected.grade);
      expect(calculation.tieBreak).toBe(item.expected.tieBreak);
      expect(calculation.release).toBe(item.expected.release ?? "unvalidated");
      expect(calculation.materialEvidenceMissing).toBe(item.materialGap ?? false);
      if (item.expected.cutoff) {
        expect(calculation.priceCutoff).toMatchObject({
          available: true,
          ...item.expected.cutoff,
        });
      }
    });
  }
});

describe("model pick price cutoff", () => {
  it("says any price keeps the grade when the model gives the side no chance to lose", async () => {
    const outcome = await runGameBoard(board(), {
      store: createMemoryStore(),
      collect: quiet,
      model: scriptedModel({ home: { win: 0, loss: 1, push: 0 } }),
    });
    const calculation = outcome.board!.markets[0].pick!.calculation;
    expect(calculation.pickedSelection).toBe("away");
    expect(calculation.grade).toBe("lean");
    expect(calculation.sides[1].expectedValue).toBeCloseTo(1.3, 9);
    expect(calculation.priceCutoff).toEqual({
      available: false,
      everyPriceKeeps: true,
      reason: "Any price keeps lean: the forecasting model gives this side no chance to lose.",
    });
  });

  it("is unavailable when the model gives the picked side no win chance", async () => {
    const outcome = await runGameBoard(
      board({ moneyline: { home: 100, away: 100, tieRule: "push" } }),
      {
        store: createMemoryStore(),
        collect: quiet,
        model: scriptedModel({ home: { win: 0, loss: 0, push: 1 } }),
      },
    );
    const calculation = outcome.board!.markets[0].pick!.calculation;
    expect(calculation.grade).toBe("no edge");
    expect(calculation.priceCutoff).toEqual({
      available: false,
      everyPriceKeeps: false,
      reason:
        "The price cutoff is unavailable because the forecasting model gives this side no win chance.",
    });
  });
});

describe("game board without a usable forecasting model", () => {
  const cases = [
    {
      name: "no forecasting model",
      model: undefined,
      reason: "No model artifact is configured.",
    },
    {
      name: "a model trained through this game",
      model: scriptedModel({
        home: { win: 0.6, loss: 0.4, push: 0 },
        trainingCutoff: "2026-10-27T00:15:00.000Z",
      }),
      reason: "trained on games through 2026-10-27T00:15:00.000Z, which includes this game",
    },
    {
      name: "a model trained after the decision cutoff",
      model: scriptedModel({
        home: { win: 0.6, loss: 0.4, push: 0 },
        trainingCutoff: "2026-10-26T12:00:00.000Z",
      }),
      reason: "trained after this board's decision cutoff",
    },
    {
      name: "a model that throws",
      model: (async () => {
        throw new Error("artifact exploded");
      }) as ModelSource,
      reason: "could not price this market: artifact exploded",
    },
  ];
  for (const item of cases) {
    it(`saves the board with a reason and no model pick for ${item.name}`, async () => {
      const store = createMemoryStore();
      const outcome = await runGameBoard(board(), {
        store,
        collect: quiet,
        model: item.model,
      });
      expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
      const saved = await store.getBoard(outcome.board!.id);
      expect(saved?.status).toBe("completed");
      expect(saved?.markets[0].offers.map((offer) => offer.americanOdds)).toEqual([-150, 130]);
      expect(saved?.markets[0].pick).toBeNull();
      expect(saved?.markets[0].noPickReason).toContain(item.reason);
    });
  }

  it("saves the evidence and gaps it collected", async () => {
    const store = createMemoryStore();
    const outcome = await runGameBoard(board(), { store });
    expect(outcome.ok).toBe(true);
    const saved = await store.getBoard(outcome.board!.id);
    expect(saved?.gaps).toEqual(
      expect.arrayContaining(["Injury report was not collected.", "Weather was not collected."]),
    );
    expect(saved?.evidence.map((item) => item.id)).toContain("schedule:2026_07_DAL_PHI");
  });
});

describe("game board rejection", () => {
  const cases: Array<{
    name: string;
    overrides: Partial<GameBoardRequest>;
    error: RegExp;
  }> = [
    {
      name: "an empty board",
      overrides: { moneyline: undefined },
      error: /at least one market/,
    },
    {
      name: "a board with only the tie rule",
      overrides: { moneyline: { tieRule: "push" } },
      error: /at least one market/,
    },
    {
      name: "a one-sided moneyline",
      overrides: { moneyline: { home: -150, tieRule: "push" } },
      error: /both moneyline prices/,
    },
    {
      name: "an invalid American price",
      overrides: { moneyline: { home: -150, away: 99, tieRule: "push" } },
      error: /Invalid American price: 99/,
    },
    {
      name: "a price of -50",
      overrides: { moneyline: { home: -50, away: 130, tieRule: "push" } },
      error: /Invalid American price/,
    },
    {
      name: "a missing tie rule",
      overrides: { moneyline: { home: -150, away: 130 } },
      error: /tie rule/,
    },
    {
      name: "an observation at kickoff",
      overrides: { observedAt: "2026-10-27T00:15:00.000Z" },
      error: /already started/,
    },
    {
      name: "a started game",
      overrides: { nowIso: "2026-10-27T00:15:00.000Z" },
      error: /already started/,
    },
    {
      name: "a one-sided spread",
      overrides: { spread: { homeLine: -3.5, awayLine: 3.5, home: -110 } },
      error: /both spread prices/,
    },
    {
      name: "a spread without its away line",
      overrides: { spread: { homeLine: -3.5, home: -110, away: -110 } },
      error: /away spread line/,
    },
    {
      name: "non-mirrored spread lines",
      overrides: {
        spread: { homeLine: -3.5, awayLine: 3, home: -110, away: -110 },
      },
      error: /mirror/,
    },
    {
      name: "a one-sided total",
      overrides: { total: { overLine: 44.5, underLine: 44.5, over: -110 } },
      error: /both total prices/,
    },
    {
      name: "different over and under totals",
      overrides: {
        total: { overLine: 44.5, underLine: 45, over: -110, under: -110 },
      },
      error: /same total/,
    },
    {
      name: "an invalid spread price",
      overrides: {
        spread: { homeLine: -3.5, awayLine: 3.5, home: -110, away: -50 },
      },
      error: /Invalid American price: -50/,
    },
    {
      name: "a total price of +99",
      overrides: {
        total: { overLine: 44.5, underLine: 44.5, over: 99, under: -110 },
      },
      error: /Invalid American price: 99/,
    },
    {
      name: "a blank sportsbook",
      overrides: { sportsbook: "  " },
      error: /sportsbook/,
    },
  ];
  for (const item of cases) {
    it(`rejects ${item.name} without saving a board`, async () => {
      const store = createMemoryStore();
      const outcome = await runGameBoard(board({ requestId: "rejected", ...item.overrides }), {
        store,
        collect: quiet,
      });
      expect(outcome.ok).toBe(false);
      expect(outcome.ok ? "" : outcome.error).toMatch(item.error);
      expect(outcome.ok ? undefined : outcome.board).toBeUndefined();
      // The submission identifier was never used, so a corrected board can still take it.
      const retried = await runGameBoard(board({ requestId: "rejected" }), {
        store,
        collect: quiet,
      });
      expect(retried.ok).toBe(true);
    });
  }

  it("never records a research analysis for a model pick", async () => {
    const store = createMemoryStore();
    const model = scriptedModel({ home: { win: 0.7, loss: 0.3, push: 0 } });
    const outcome = await runGameBoard(board(), {
      store,
      collect: quiet,
      model,
    });
    expect(outcome.ok).toBe(true);
    expect(await store.listCompleted()).toEqual([]);
  });
});
