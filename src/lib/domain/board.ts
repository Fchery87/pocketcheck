import { americanToDecimal, PriceError } from "./odds.ts";
import { OfferError, parseOffer, type Market, type Offer, type TieRule } from "./offer.ts";

/** Both moneyline prices as the sportsbook lists them. A blank side is undefined. */
export type BoardMoneylineInput = {
  home?: number;
  away?: number;
  tieRule?: TieRule;
};

export type GameBoardInput = {
  gameId: string;
  kickoffAt: string;
  sportsbook: string;
  observedAt: string;
  moneyline?: BoardMoneylineInput;
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

/** A sportsbook lists American odds at +100 or above, or at -100 or below. */
function requirePrice(american: number): void {
  americanToDecimal(american);
  if (Math.abs(american) < 100) throw new PriceError(`Invalid American price: ${american}`);
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
  requirePrice(home);
  requirePrice(away);
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
      opposing: { sportsbook: input.sportsbook, americanOdds: other, observedAt: input.observedAt },
    });
  return { market: "moneyline", offers: [side("home", home, away), side("away", away, home)] };
}

/**
 * Parses a game board into two-sided offers per entered market, using the offer rules. Rejects
 * an empty board, a one-sided market, an invalid price, and an observation at or after kickoff.
 */
export function parseGameBoard(input: GameBoardInput): BoardMarketOffers[] {
  if (!input.sportsbook.trim()) throw new BoardError("Enter the sportsbook for this board.");
  const markets: BoardMarketOffers[] = [];
  try {
    const priced = input.moneyline ? moneyline(input, input.moneyline) : undefined;
    if (priced) markets.push(priced);
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
