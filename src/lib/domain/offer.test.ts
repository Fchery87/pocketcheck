import { describe, expect, it } from "vite-plus/test";
import { parseOffer, type OfferInput } from "#lib/domain/offer.ts";
import { settleOffer } from "#lib/domain/settlement.ts";

const kickoff = "2026-11-01T18:00:00.000Z";
const observed = "2026-11-01T16:00:00.000Z";

function moneyline(overrides: Partial<OfferInput> = {}): OfferInput {
  return {
    gameId: "2026_09_BUF_KC",
    sportsbook: "Example Book",
    market: "moneyline",
    selection: "home",
    americanOdds: -150,
    observedAt: observed,
    kickoffAt: kickoff,
    rules: { period: "full-game", overtime: "included", tie: "push" },
    ...overrides,
  };
}

describe("offer validation", () => {
  it("accepts a full-game moneyline with an explicit tie rule", () => {
    const offer = parseOffer(moneyline());
    expect(offer.market).toBe("moneyline");
    expect(offer.rules.tie).toBe("push");
  });

  it("rejects a moneyline that omits the tie rule", () => {
    expect(() =>
      parseOffer(
        moneyline({
          rules: { period: "full-game", overtime: "included" },
        }),
      ),
    ).toThrow(/tie rule/);
  });

  it("rejects a spread or total that is missing its point line", () => {
    expect(() =>
      parseOffer(
        moneyline({
          market: "spread",
          selection: "away",
          rules: { period: "full-game", overtime: "included" },
        }),
      ),
    ).toThrow(/point line/);
    expect(() =>
      parseOffer(
        moneyline({
          market: "total",
          selection: "over",
          rules: { period: "full-game", overtime: "included" },
        }),
      ),
    ).toThrow(/point line/);
  });

  it("rejects an offer observed after kickoff", () => {
    expect(() => parseOffer(moneyline({ observedAt: "2026-11-01T18:05:00.000Z" }))).toThrow(
      /already started/,
    );
  });

  it("rejects an opposing price on a different line or book", () => {
    expect(() =>
      parseOffer(
        moneyline({
          market: "spread",
          selection: "home",
          pointLine: -3,
          opposing: {
            sportsbook: "Other Book",
            pointLine: -3,
            americanOdds: 110,
            observedAt: observed,
          },
        }),
      ),
    ).toThrow(/not comparable/);
  });
});

describe("settlement", () => {
  it("wins a spread when the selected margin plus the line is positive", () => {
    const offer = parseOffer(
      moneyline({
        market: "spread",
        selection: "away",
        pointLine: 3.5,
        americanOdds: -110,
      }),
    );
    expect(settleOffer(offer, { homeScore: 24, awayScore: 21 })).toBe("win");
  });

  it("pushes a whole-number spread on equality and loses when short", () => {
    const offer = parseOffer(
      moneyline({
        market: "spread",
        selection: "home",
        pointLine: -3,
        americanOdds: -110,
      }),
    );
    expect(settleOffer(offer, { homeScore: 24, awayScore: 21 })).toBe("push");
    expect(settleOffer(offer, { homeScore: 23, awayScore: 21 })).toBe("loss");
  });

  it("grades an over by combined points and the selected direction", () => {
    const offer = parseOffer(
      moneyline({
        market: "total",
        selection: "over",
        pointLine: 44.5,
        americanOdds: -110,
      }),
    );
    expect(settleOffer(offer, { homeScore: 24, awayScore: 21 })).toBe("win");
    expect(settleOffer(offer, { homeScore: 20, awayScore: 17 })).toBe("loss");
  });

  it("follows the saved moneyline tie rule instead of grading a tie as a loss", () => {
    const pushTie = parseOffer(moneyline());
    const lossTie = parseOffer(
      moneyline({
        rules: { period: "full-game", overtime: "included", tie: "loss" },
      }),
    );
    expect(settleOffer(pushTie, { homeScore: 20, awayScore: 20 })).toBe("push");
    expect(settleOffer(lossTie, { homeScore: 20, awayScore: 20 })).toBe("loss");
  });

  it("returns void when the saved rules void the result", () => {
    const offer = parseOffer(
      moneyline({
        rules: { period: "full-game", overtime: "included", tie: "void" },
      }),
    );
    expect(settleOffer(offer, { homeScore: 20, awayScore: 20, voided: true })).toBe("void");
  });
});
