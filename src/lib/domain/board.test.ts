import { describe, expect, it } from "vite-plus/test";
import {
  BoardError,
  anchorPairOf,
  parseGameBoard,
  type BoardQuote,
  type GameBoardInput,
} from "#lib/domain/board.ts";

const KICKOFF = "2026-10-25T17:00:00.000Z";
const OBSERVED = "2026-10-25T15:30:00.000Z";

function input(overrides: Partial<GameBoardInput>): GameBoardInput {
  return {
    gameId: "2026_07_DAL_PHI",
    kickoffAt: KICKOFF,
    sportsbook: "Anchor Book",
    observedAt: OBSERVED,
    ...overrides,
  };
}

function quote(overrides: Partial<BoardQuote> & Pick<BoardQuote, "market" | "selection">) {
  return {
    sportsbook: "Shop Book",
    americanOdds: 100,
    pointLine: null,
    observedAt: "2026-10-25T15:10:00.000Z",
    ...overrides,
  } satisfies BoardQuote;
}

function only(board: GameBoardInput) {
  const [market] = parseGameBoard(board);
  return market!;
}

const priced = (market: ReturnType<typeof only>) =>
  market.offers.map((offer) => [offer.selection, offer.sportsbook, offer.americanOdds]);

describe("spread shopping", () => {
  const spread = { homeLine: -3.5, awayLine: 3.5, home: -110, away: -110 };

  it("executes an away +3.5 quote only on away +3.5", () => {
    const market = only(
      input({
        spread,
        extraQuotes: [quote({ market: "spread", selection: "away", pointLine: 3.5 })],
      }),
    );
    expect(priced(market)).toEqual([
      ["home", "Anchor Book", -110],
      ["away", "Shop Book", 100],
    ]);
    expect(market.quotes).toEqual([expect.objectContaining({ sameLine: true, best: true })]);
  });

  it("never compares an away -3.5 quote with the home -3.5 side", () => {
    const market = only(
      input({
        spread,
        extraQuotes: [quote({ market: "spread", selection: "away", pointLine: -3.5 })],
      }),
    );
    expect(priced(market)).toEqual([
      ["home", "Anchor Book", -110],
      ["away", "Anchor Book", -110],
    ]);
    expect(market.quotes).toEqual([expect.objectContaining({ sameLine: false, best: false })]);
  });

  it("matches each side's own line when the home side is getting points", () => {
    const market = only(
      input({
        spread: { homeLine: 2.5, awayLine: -2.5, home: -105, away: -115 },
        extraQuotes: [
          quote({
            market: "spread",
            selection: "home",
            pointLine: 2.5,
            americanOdds: 102,
          }),
          quote({
            market: "spread",
            selection: "away",
            pointLine: 2.5,
            americanOdds: 150,
          }),
          quote({
            market: "spread",
            selection: "away",
            pointLine: -2.5,
            americanOdds: -108,
          }),
        ],
      }),
    );
    expect(priced(market)).toEqual([
      ["home", "Shop Book", 102],
      ["away", "Shop Book", -108],
    ]);
    expect(market.quotes.map((item) => [item.sameLine, item.best])).toEqual([
      [true, true],
      [false, false],
      [true, true],
    ]);
  });
});

describe("total shopping", () => {
  it("executes a better under on the same total and ignores another total", () => {
    const market = only(
      input({
        total: { overLine: 44.5, underLine: 44.5, over: -105, under: -115 },
        extraQuotes: [
          quote({
            market: "total",
            selection: "under",
            pointLine: 44.5,
            americanOdds: -102,
          }),
          quote({
            market: "total",
            selection: "over",
            pointLine: 45.5,
            americanOdds: 120,
          }),
        ],
      }),
    );
    expect(priced(market)).toEqual([
      ["over", "Anchor Book", -105],
      ["under", "Shop Book", -102],
    ]);
    expect(market.offers[1].pointLine).toBe(44.5);
    expect(market.quotes.map((item) => [item.sameLine, item.best])).toEqual([
      [true, true],
      [false, false],
    ]);
  });
});

describe("moneyline shopping", () => {
  const moneyline = { home: -150, away: 130, tieRule: "push" as const };

  it("executes a better moneyline price at its own sportsbook and observation time", () => {
    const market = only(
      input({
        moneyline,
        extraQuotes: [
          quote({
            market: "moneyline",
            selection: "away",
            americanOdds: 140,
            observedAt: "2026-10-25T14:00:00.000Z",
          }),
        ],
      }),
    );
    expect(priced(market)).toEqual([
      ["home", "Anchor Book", -150],
      ["away", "Shop Book", 140],
    ]);
    expect(market.offers[1].observedAt).toBe("2026-10-25T14:00:00.000Z");
    expect(market.offers[0].observedAt).toBe(OBSERVED);
  });

  it("never gives a worse extra quote the best-price badge", () => {
    const market = only(
      input({
        moneyline,
        extraQuotes: [quote({ market: "moneyline", selection: "home", americanOdds: -160 })],
      }),
    );
    expect(priced(market)[0]).toEqual(["home", "Anchor Book", -150]);
    expect(market.quotes).toEqual([expect.objectContaining({ sameLine: true, best: false })]);
  });

  it("keeps the anchor price when an extra quote only ties it", () => {
    const market = only(
      input({
        moneyline,
        extraQuotes: [quote({ market: "moneyline", selection: "home", americanOdds: -150 })],
      }),
    );
    expect(priced(market)[0]).toEqual(["home", "Anchor Book", -150]);
    expect(market.quotes[0]!.best).toBe(false);
  });

  it("breaks a tie between better extra quotes by sportsbook, then observation time, then entry order", () => {
    const tied = [
      quote({
        market: "moneyline",
        selection: "away",
        americanOdds: 140,
        sportsbook: "Zed Book",
      }),
      quote({
        market: "moneyline",
        selection: "away",
        americanOdds: 140,
        sportsbook: "Alpha Book",
        observedAt: "2026-10-25T15:20:00.000Z",
      }),
      quote({
        market: "moneyline",
        selection: "away",
        americanOdds: 140,
        sportsbook: "Alpha Book",
        observedAt: "2026-10-25T15:05:00.000Z",
      }),
      quote({
        market: "moneyline",
        selection: "away",
        americanOdds: 140,
        sportsbook: "Alpha Book",
        observedAt: "2026-10-25T15:05:00.000Z",
      }),
    ];
    for (const extraQuotes of [tied, [...tied].reverse()]) {
      const market = only(input({ moneyline, extraQuotes }));
      expect(market.offers[1]).toMatchObject({
        sportsbook: "Alpha Book",
        americanOdds: 140,
        observedAt: "2026-10-25T15:05:00.000Z",
      });
      expect(market.quotes.filter((item) => item.best)).toHaveLength(1);
    }
    const market = only(input({ moneyline, extraQuotes: tied }));
    expect(market.quotes.map((item) => item.best)).toEqual([false, false, true, false]);
  });

  it("treats a quote under a different tie rule as another contract", () => {
    const market = only(
      input({
        moneyline,
        extraQuotes: [
          quote({
            market: "moneyline",
            selection: "away",
            americanOdds: 200,
            tieRule: "void",
          }),
        ],
      }),
    );
    expect(priced(market)[1]).toEqual(["away", "Anchor Book", 130]);
    expect(market.quotes).toEqual([expect.objectContaining({ sameLine: false, best: false })]);
  });

  it("rejects an extra quote observed at or after kickoff", () => {
    expect(() =>
      parseGameBoard(
        input({
          moneyline,
          extraQuotes: [
            quote({
              market: "moneyline",
              selection: "away",
              observedAt: KICKOFF,
            }),
          ],
        }),
      ),
    ).toThrow(BoardError);
  });
});

describe("anchor pair", () => {
  it("keeps the anchor sportsbook's own two sides apart from every shopped price", () => {
    const [moneyline, spread] = parseGameBoard(
      input({
        moneyline: { home: -150, away: 130, tieRule: "push" },
        spread: { homeLine: -3.5, awayLine: 3.5, home: -110, away: -110 },
        extraQuotes: [
          quote({ market: "moneyline", selection: "home", americanOdds: -135 }),
          quote({
            market: "spread",
            selection: "away",
            pointLine: 3.5,
            americanOdds: 105,
          }),
        ],
      }),
    );
    for (const market of [moneyline!, spread!]) {
      expect(market.pricing.format).toBe("paired-anchor-1");
      expect(market.pricing.anchor.map((side) => side.sportsbook)).toEqual([
        "Anchor Book",
        "Anchor Book",
      ]);
      expect(market.pricing.anchor.map((side) => side.observedAt)).toEqual([OBSERVED, OBSERVED]);
    }
    expect(moneyline!.pricing.anchor.map((side) => side.americanOdds)).toEqual([-150, 130]);
    expect(spread!.pricing.anchor.map((side) => [side.pointLine, side.americanOdds])).toEqual([
      [-3.5, -110],
      [3.5, -110],
    ]);
    expect(anchorPairOf(moneyline!)).toEqual(moneyline!.pricing.anchor);
  });

  it("recovers a legacy anchor only from saved opposing prices that prove one pair", () => {
    const market = only(
      input({
        moneyline: { home: -150, away: 130, tieRule: "push" },
        extraQuotes: [quote({ market: "moneyline", selection: "home", americanOdds: -135 })],
      }),
    );
    const { pricing: _pricing, ...legacy } = market;
    expect(
      anchorPairOf(legacy)?.map((side) => [side.sportsbook, side.selection, side.americanOdds]),
    ).toEqual([
      ["Anchor Book", "home", -150],
      ["Anchor Book", "away", 130],
    ]);

    const missing = structuredClone(legacy);
    missing.offers[0] = { ...missing.offers[0], opposing: null };
    expect(anchorPairOf(missing)).toBeNull();

    const mixed = structuredClone(legacy);
    mixed.offers[1] = {
      ...mixed.offers[1],
      opposing: { ...mixed.offers[1].opposing!, sportsbook: "Other Book" },
    };
    expect(anchorPairOf(mixed)).toBeNull();
  });
});
