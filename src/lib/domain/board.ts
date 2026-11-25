import { americanToDecimal, PriceError } from "./odds.ts";
import {
  bookKey,
  sameBook,
  OfferError,
  parseOffer,
  type Market,
  type Offer,
  type SideSelection,
  type TieRule,
} from "./offer.ts";

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
  /**
   * More prices for a side, each from its own sportsbook. The best available price is the highest
   * decimal odds on that side's own contract, the anchor price included. A different line or rule
   * is another contract and is not compared.
   */
  extraQuotes?: BoardQuote[];
};

/** The format of a market's saved anchor pair. A market saved before it has no `pricing`. */
export const PAIRED_ANCHOR_FORMAT = "paired-anchor-1";

/**
 * The anchor sportsbook's own two sides, home (or over) first, at one observation time. They are
 * the only source of the no-vig probabilities, the sportsbook margin, and the forecast's anchor.
 */
export type BoardPricing = {
  format: typeof PAIRED_ANCHOR_FORMAT;
  anchor: [Offer, Offer];
};

/** One entered market with its anchor pair and the price each side is executed at. */
export type PricedMarket = {
  market: Market;
  pricing: BoardPricing;
  /**
   * The executable offers, home (or over) first: the best decimal odds on each side's own
   * contract, the anchor price included. Each names the anchor's other side as its opposing price.
   */
  offers: [Offer, Offer];
  /** Every extra quote, marked with whether it is the same contract and whether it was executed. */
  quotes: BoardQuoteResult[];
};

/** A price from a sportsbook other than the anchor sportsbook. */
export type BoardQuote = {
  sportsbook: string;
  market: Market;
  selection: SideSelection;
  americanOdds: number;
  /** The point line this quote is on. Null for a moneyline. */
  pointLine: number | null;
  observedAt: string;
  /** A moneyline quote's tie rule. Absent means the anchor sportsbook's tie rule. */
  tieRule?: TieRule;
};

export type BoardQuoteResult = BoardQuote & {
  /**
   * True when this quote is the same contract as an anchor side: that selection, that side's own
   * point line, and the same rules. Away +3.5 is never the contract of home -3.5.
   */
  sameLine: boolean;
  /**
   * True only for the quote its side is executed at. A quote that trails or ties the anchor price
   * is not marked, and among tied better quotes only the selected one is.
   */
  best: boolean;
};

type AnchorSide<S extends SideSelection> = Offer & { selection: S };
type MarketQuote<M extends Market, S extends SideSelection> = BoardQuote & {
  market: M;
  selection: S;
};

/** One market's parsed prices: the anchor sportsbook's pair and the other sportsbooks' quotes. */
export type MarketQuotes =
  | {
      market: "moneyline";
      anchor: readonly [AnchorSide<"home">, AnchorSide<"away">];
      extras: readonly MarketQuote<"moneyline", "home" | "away">[];
    }
  | {
      market: "spread";
      anchor: readonly [AnchorSide<"home">, AnchorSide<"away">];
      extras: readonly MarketQuote<"spread", "home" | "away">[];
    }
  | {
      market: "total";
      anchor: readonly [AnchorSide<"over">, AnchorSide<"under">];
      extras: readonly MarketQuote<"total", "over" | "under">[];
    };

export class BoardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoardError";
  }
}

const RULES = { period: "full-game", overtime: "included" } as const;

const SIDES = {
  moneyline: ["home", "away"],
  spread: ["home", "away"],
  total: ["over", "under"],
} as const satisfies Record<Market, readonly [SideSelection, SideSelection]>;

/** The entered quotes for one market, each checked as a contract a sportsbook could offer. */
function extrasFor<M extends Market>(
  input: GameBoardInput,
  market: M,
): MarketQuote<M, (typeof SIDES)[M][number]>[] {
  const kickoff = Date.parse(input.kickoffAt);
  return (input.extraQuotes ?? [])
    .filter((quote) => quote.market === market)
    .map((quote) => {
      const name = `The ${quote.sportsbook} ${market} quote`;
      if (!quote.sportsbook.trim()) throw new BoardError(`A ${market} quote needs its sportsbook.`);
      if (!(SIDES[market] as readonly SideSelection[]).includes(quote.selection)) {
        throw new BoardError(`${name} names ${quote.selection}, which is not a ${market} side.`);
      }
      americanToDecimal(quote.americanOdds);
      const observed = Date.parse(quote.observedAt);
      if (!Number.isFinite(observed) || !(observed < kickoff)) {
        throw new BoardError(`${name} must be observed before kickoff.`);
      }
      if (market === "moneyline" ? quote.pointLine !== null : !Number.isFinite(quote.pointLine)) {
        throw new BoardError(
          market === "moneyline" ? `${name} has no point line.` : `${name} needs its point line.`,
        );
      }
      if (market !== "moneyline" && quote.tieRule !== undefined) {
        throw new BoardError(`${name} has no tie rule.`);
      }
      return quote as MarketQuote<M, (typeof SIDES)[M][number]>;
    });
}

function sameContract(quote: BoardQuote, side: Offer): boolean {
  return (
    quote.selection === side.selection &&
    quote.pointLine === side.pointLine &&
    (quote.tieRule ?? side.rules.tie) === side.rules.tie
  );
}

/** Highest decimal odds first, then sportsbook, then earliest observation, then entry order. */
function preferred(
  left: { quote: BoardQuote; index: number },
  right: { quote: BoardQuote; index: number },
): number {
  const price =
    americanToDecimal(right.quote.americanOdds) - americanToDecimal(left.quote.americanOdds);
  if (price !== 0) return price;
  if (!sameBook(left.quote.sportsbook, right.quote.sportsbook)) {
    const leftKey = bookKey(left.quote.sportsbook);
    const rightKey = bookKey(right.quote.sportsbook);
    return leftKey < rightKey ? -1 : 1;
  }
  const time = Date.parse(left.quote.observedAt) - Date.parse(right.quote.observedAt);
  return time !== 0 ? time : left.index - right.index;
}

/**
 * Chooses the price each side is executed at: the highest decimal odds on that side's own
 * contract, the anchor price included. The anchor wins a tie. The chosen quote keeps its own
 * sportsbook and observation time. The anchor pair itself is never changed.
 */
export function selectMarketPrices(quotes: MarketQuotes): PricedMarket {
  const anchor = quotes.anchor;
  const extras: readonly BoardQuote[] = quotes.extras;
  const executedAt = anchor.map((side) => {
    const better = extras
      .map((quote, index) => ({ quote, index }))
      .filter(
        ({ quote }) =>
          sameContract(quote, side) && americanToDecimal(quote.americanOdds) > side.decimalOdds,
      )
      .sort(preferred);
    return better[0]?.index ?? null;
  });
  const executable = anchor.map((side, index) => {
    const chosen = executedAt[index];
    if (chosen === null || chosen === undefined) return side;
    const quote = extras[chosen]!;
    const other = anchor[1 - index]!;
    return parseOffer({
      gameId: side.gameId,
      sportsbook: quote.sportsbook,
      market: side.market,
      selection: side.selection,
      ...(side.pointLine === null ? {} : { pointLine: side.pointLine }),
      americanOdds: quote.americanOdds,
      observedAt: quote.observedAt,
      kickoffAt: side.kickoffAt,
      rules: side.rules,
      shopped: true,
      opposing: {
        sportsbook: other.sportsbook,
        ...(other.pointLine === null ? {} : { pointLine: other.pointLine }),
        americanOdds: other.americanOdds,
        observedAt: other.observedAt,
      },
    });
  }) as [Offer, Offer];
  return {
    market: quotes.market,
    pricing: { format: PAIRED_ANCHOR_FORMAT, anchor: [anchor[0], anchor[1]] },
    offers: executable,
    quotes: extras.map((quote, index) => {
      const side = anchor.find((item) => item.selection === quote.selection);
      return {
        ...quote,
        sameLine: side !== undefined && sameContract(quote, side),
        best: executedAt.includes(index),
      };
    }),
  };
}

/** One anchor side, naming the anchor sportsbook's other side as its opposing price. */
function anchorSide<S extends SideSelection>(
  input: GameBoardInput,
  market: Market,
  side: {
    selection: S;
    line?: number;
    own: number;
    other: number;
    otherLine?: number;
  },
  rules: Offer["rules"] | typeof RULES,
): AnchorSide<S> {
  return parseOffer({
    gameId: input.gameId,
    sportsbook: input.sportsbook,
    market,
    selection: side.selection,
    ...(side.line === undefined ? {} : { pointLine: side.line }),
    americanOdds: side.own,
    observedAt: input.observedAt,
    kickoffAt: input.kickoffAt,
    rules: { ...rules },
    opposing: {
      sportsbook: input.sportsbook,
      ...(side.otherLine === undefined ? {} : { pointLine: side.otherLine }),
      americanOdds: side.other,
      observedAt: input.observedAt,
    },
  }) as AnchorSide<S>;
}

/**
 * True when `pricing` is the current format and its anchor is one sportsbook's two sides at one
 * observation time, on the same contracts as the executable offers.
 */
export function provesAnchorPair(market: {
  market: Market;
  offers: readonly [Offer, Offer];
  pricing?: unknown;
}): boolean {
  try {
    return pairedAnchor(market);
  } catch {
    return false;
  }
}

function pairedAnchor(market: {
  market: Market;
  offers: readonly [Offer, Offer];
  pricing?: unknown;
}): boolean {
  const pricing = market.pricing as Partial<BoardPricing> | undefined;
  if (pricing?.format !== PAIRED_ANCHOR_FORMAT || !Array.isArray(pricing.anchor)) return false;
  if (pricing.anchor.length !== 2) return false;
  const [home, away] = pricing.anchor as [Offer, Offer];
  const sides = SIDES[market.market];
  if (!sides) return false;
  const lines =
    market.market === "moneyline"
      ? home.pointLine === null && away.pointLine === null
      : market.market === "spread"
        ? Number.isFinite(home.pointLine) && away.pointLine === -home.pointLine!
        : Number.isFinite(home.pointLine) && away.pointLine === home.pointLine;
  return (
    lines &&
    sameBook(home.sportsbook, away.sportsbook) &&
    home.observedAt === away.observedAt &&
    [home, away].every((side, index) => {
      const executed = market.offers[index]!;
      return (
        side.market === market.market &&
        side.selection === sides[index] &&
        side.gameId === executed.gameId &&
        side.kickoffAt === executed.kickoffAt &&
        side.selection === executed.selection &&
        side.pointLine === executed.pointLine &&
        side.rules?.tie === executed.rules.tie &&
        side.decimalOdds === americanToDecimal(side.americanOdds)
      );
    })
  );
}

/**
 * The anchor pair a saved market proves. A market saved with its pricing format has it explicitly.
 * An older market is recovered only when both opposing prices name one sportsbook at one
 * observation time on the mirrored contract, and a side priced at that sportsbook agrees with
 * them. Anything less is null: the anchor is unavailable, never inferred.
 */
export function anchorPairOf(market: {
  market: Market;
  offers: readonly [Offer, Offer];
  pricing?: BoardPricing;
}): readonly [Offer, Offer] | null {
  if (market.pricing) return market.pricing.anchor;
  const [first, second] = market.offers;
  const home = second.opposing;
  const away = first.opposing;
  if (!home || !away) return null;
  if (!sameBook(home.sportsbook, away.sportsbook) || home.observedAt !== away.observedAt)
    return null;
  if (
    (home.pointLine ?? null) !== first.pointLine ||
    (away.pointLine ?? null) !== second.pointLine
  ) {
    return null;
  }
  for (const [offer, recorded] of [
    [first, home],
    [second, away],
  ] as const) {
    if (
      sameBook(offer.sportsbook, recorded.sportsbook) &&
      (offer.americanOdds !== recorded.americanOdds || offer.observedAt !== recorded.observedAt)
    ) {
      return null;
    }
  }
  const side = (offer: Offer, own: typeof home, other: typeof home): Offer =>
    parseOffer({
      gameId: offer.gameId,
      sportsbook: own.sportsbook,
      market: offer.market,
      selection: offer.selection,
      ...(offer.pointLine === null ? {} : { pointLine: offer.pointLine }),
      americanOdds: own.americanOdds,
      observedAt: own.observedAt,
      kickoffAt: offer.kickoffAt,
      rules: offer.rules,
      opposing: other,
    });
  try {
    return [side(first, home, away), side(second, away, home)];
  } catch (error) {
    if (error instanceof OfferError || error instanceof PriceError) return null;
    throw error;
  }
}

function entered(value: number | undefined): value is number {
  return value !== undefined && value !== null;
}

function moneyline(input: GameBoardInput, prices: BoardMoneylineInput): MarketQuotes | undefined {
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
  const rules = { ...RULES, tie: prices.tieRule };
  return {
    market: "moneyline",
    anchor: [
      anchorSide(input, "moneyline", { selection: "home", own: home, other: away }, rules),
      anchorSide(input, "moneyline", { selection: "away", own: away, other: home }, rules),
    ],
    extras: extrasFor(input, "moneyline"),
  };
}

function spread(input: GameBoardInput, prices: BoardSpreadInput): MarketQuotes | undefined {
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
  return {
    market: "spread",
    anchor: [
      anchorSide(
        input,
        "spread",
        {
          selection: "home",
          line: homeLine,
          own: home,
          other: away,
          otherLine: awayLine,
        },
        RULES,
      ),
      anchorSide(
        input,
        "spread",
        {
          selection: "away",
          line: awayLine,
          own: away,
          other: home,
          otherLine: homeLine,
        },
        RULES,
      ),
    ],
    extras: extrasFor(input, "spread"),
  };
}

function total(input: GameBoardInput, prices: BoardTotalInput): MarketQuotes | undefined {
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
  const side = <S extends "over" | "under">(selection: S, own: number, other: number) =>
    anchorSide(
      input,
      "total",
      { selection, line: overLine, own, other, otherLine: overLine },
      RULES,
    );
  return {
    market: "total",
    anchor: [side("over", over, under), side("under", under, over)],
    extras: extrasFor(input, "total"),
  };
}

/**
 * Parses a game board into two-sided offers per entered market, using the offer rules. Rejects
 * an empty board, a one-sided market, non-mirrored spread lines, different totals, an invalid
 * price, a missing tie rule, and an observation at or after kickoff.
 */
export function parseGameBoard(input: GameBoardInput): PricedMarket[] {
  if (!input.sportsbook.trim()) throw new BoardError("Enter the sportsbook for this board.");
  const markets: PricedMarket[] = [];
  try {
    for (const quotes of [
      input.moneyline ? moneyline(input, input.moneyline) : undefined,
      input.spread ? spread(input, input.spread) : undefined,
      input.total ? total(input, input.total) : undefined,
    ]) {
      if (quotes) markets.push(selectMarketPrices(quotes));
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
