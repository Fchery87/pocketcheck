import { americanToDecimal, PriceError } from "./odds.ts";
import { OfferError, parseOffer, type Market, type Offer, type TieRule } from "./offer.ts";

/** Both moneyline prices as the sportsbook lists them. A blank side is undefined. */
export type BoardMoneylineInput = {
  home?: number;
  away?: number;
  tieRule?: TieRule;
};

/** Both spread prices. Lines belong to their side: home -3.5 pairs with away +3.5. */
export type BoardSpreadInput = {
  homeLine?: number;
  awayLine?: number;
  home?: number;
  away?: number;
};

/** Both total prices. Over and under must share one number. */
export type BoardTotalInput = {
  overLine?: number;
  underLine?: number;
  over?: number;
  under?: number;
};

export type GameBoardInput = {
  gameId: string;
  kickoffAt: string;
  sportsbook: string;
  observedAt: string;
  moneyline?: BoardMoneylineInput;
  spread?: BoardSpreadInput;
  total?: BoardTotalInput;
};

/** One entered market: home (or over) first, each offer naming the other as its opposing price. */
export type BoardMarketOffers = {
  market: Market;
  offers: [Offer, Offer];
};

export class BoardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoardError";
  }
}

const RULES = { period: "full-game", overtime: "included" } as const;

function entered(value: number | undefined): value is number {
  return value !== undefined && value !== null;
}

function moneyline(
  input: GameBoardInput,
  prices: BoardMoneylineInput,
): BoardMarketOffers | undefined {
  const { home, away } = prices;
  if (!entered(home) && !entered(away)) return undefined;
  if (!entered(home) || !entered(away)) {
    throw new BoardError("Enter both moneyline prices, home and away, to compare the two sides.");
  }
  americanToDecimal(home);
  americanToDecimal(away);
  if (prices.tieRule === undefined) {
    throw new BoardError("A moneyline requires a tie rule");
  }
  const side = (selection: "home" | "away", own: number, other: number) =>
    parseOffer({
      gameId: input.gameId,
      sportsbook: input.sportsbook,
      market: "moneyline",
      selection,
      americanOdds: own,
      observedAt: input.observedAt,
      kickoffAt: input.kickoffAt,
      rules: { ...RULES, tie: prices.tieRule },
      opposing: {
        sportsbook: input.sportsbook,
        americanOdds: other,
        observedAt: input.observedAt,
      },
    });
  return {
    market: "moneyline",
    offers: [side("home", home, away), side("away", away, home)],
  };
}

function spread(input: GameBoardInput, prices: BoardSpreadInput): BoardMarketOffers | undefined {
  const { homeLine, awayLine, home, away } = prices;
  if (![homeLine, awayLine, home, away].some(entered)) return undefined;
  if (!entered(home) || !entered(away)) {
    throw new BoardError("Enter both spread prices, home and away, to compare the two sides.");
  }
  if (!entered(homeLine) || !Number.isFinite(homeLine)) {
    throw new BoardError("Enter the home spread line.");
  }
  if (!entered(awayLine) || !Number.isFinite(awayLine)) {
    throw new BoardError("Enter the away spread line, the mirror of the home line.");
  }
  if (awayLine !== -homeLine) {
    throw new BoardError(
      `The spread lines must mirror each other: home ${homeLine} pairs with away ${-homeLine + 0}, not ${awayLine}.`,
    );
  }
  const side = (
    selection: "home" | "away",
    line: number,
    own: number,
    other: number,
    otherLine: number,
  ) =>
    parseOffer({
      gameId: input.gameId,
      sportsbook: input.sportsbook,
      market: "spread",
      selection,
      pointLine: line,
      americanOdds: own,
      observedAt: input.observedAt,
      kickoffAt: input.kickoffAt,
      rules: { ...RULES },
      opposing: {
        sportsbook: input.sportsbook,
        pointLine: otherLine,
        americanOdds: other,
        observedAt: input.observedAt,
      },
    });
  return {
    market: "spread",
    offers: [
      side("home", homeLine, home, away, awayLine),
      side("away", awayLine, away, home, homeLine),
    ],
  };
}

function total(input: GameBoardInput, prices: BoardTotalInput): BoardMarketOffers | undefined {
  const { overLine, underLine, over, under } = prices;
  if (![overLine, underLine, over, under].some(entered)) return undefined;
  if (!entered(over) || !entered(under)) {
    throw new BoardError("Enter both total prices, over and under, to compare the two sides.");
  }
  if (!entered(overLine) || !entered(underLine) || !Number.isFinite(overLine)) {
    throw new BoardError("Enter the total.");
  }
  if (overLine !== underLine) {
    throw new BoardError(
      `Over and under must share the same total, not ${overLine} and ${underLine}.`,
    );
  }
  const side = (selection: "over" | "under", own: number, other: number) =>
    parseOffer({
      gameId: input.gameId,
      sportsbook: input.sportsbook,
      market: "total",
      selection,
      pointLine: overLine,
      americanOdds: own,
      observedAt: input.observedAt,
      kickoffAt: input.kickoffAt,
      rules: { ...RULES },
      opposing: {
        sportsbook: input.sportsbook,
        pointLine: overLine,
        americanOdds: other,
        observedAt: input.observedAt,
      },
    });
  return {
    market: "total",
    offers: [side("over", over, under), side("under", under, over)],
  };
}

/**
 * Parses a game board into two-sided offers per entered market, using the offer rules. Rejects
 * an empty board, a one-sided market, non-mirrored spread lines, different totals, an invalid
 * price, a missing tie rule, and an observation at or after kickoff.
 */
export function parseGameBoard(input: GameBoardInput): BoardMarketOffers[] {
  if (!input.sportsbook.trim()) throw new BoardError("Enter the sportsbook for this board.");
  const markets: BoardMarketOffers[] = [];
  try {
    for (const priced of [
      input.moneyline ? moneyline(input, input.moneyline) : undefined,
      input.spread ? spread(input, input.spread) : undefined,
      input.total ? total(input, input.total) : undefined,
    ]) {
      if (priced) markets.push(priced);
    }
  } catch (error) {
    if (error instanceof OfferError || error instanceof PriceError) {
      throw new BoardError(error.message);
    }
    throw error;
  }
  if (markets.length === 0) {
    throw new BoardError("Enter both sides of at least one market.");
  }
  return markets;
}
