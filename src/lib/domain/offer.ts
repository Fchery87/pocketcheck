import { americanToDecimal, PriceError } from "#lib/domain/odds.ts";

export type Market = "moneyline" | "spread" | "total";
export type SideSelection = "home" | "away" | "over" | "under";
export type TieRule = "push" | "loss" | "win" | "void";

export type OfferRules = {
  period: "full-game";
  overtime: "included";
  tie?: TieRule;
};

export type OpposingPrice = {
  sportsbook: string;
  pointLine?: number;
  americanOdds: number;
  observedAt: string;
};

export type OfferInput = {
  gameId: string;
  sportsbook: string;
  market: Market;
  selection: SideSelection;
  pointLine?: number;
  americanOdds: number;
  observedAt: string;
  kickoffAt: string;
  rules: OfferRules;
  opposing?: OpposingPrice;
};

export type Offer = {
  gameId: string;
  sportsbook: string;
  market: Market;
  selection: SideSelection;
  pointLine: number | null;
  americanOdds: number;
  decimalOdds: number;
  observedAt: string;
  kickoffAt: string;
  rules: {
    period: "full-game";
    overtime: "included";
    tie: TieRule | null;
  };
  opposing: OpposingPrice | null;
};

export type OfferEntryGuidance = {
  selections: readonly SideSelection[];
  /** Null when this market has no point line. */
  line: string | null;
  /** Null when this market has no tie rule. */
  tieRule: string | null;
  explanation: string;
};

const GUIDANCE: Record<Market, OfferEntryGuidance> = {
  moneyline: {
    selections: ["home", "away"],
    line: null,
    tieRule: "A moneyline needs a tie rule: push, loss, win, or void.",
    explanation:
      "Home and away are the two sides. A tie is not a win or a loss until the tie rule says so.",
  },
  spread: {
    selections: ["home", "away"],
    line: "Enter the line for the side you selected. Home −3.5 is the home side. The other side is +3.5, not the same number.",
    tieRule: null,
    explanation:
      "A positive line means that side is getting points. A negative line means that side is giving points.",
  },
  total: {
    selections: ["over", "under"],
    line: "Enter the total. Over 44.5 and under 44.5 share that number.",
    tieRule: null,
    explanation: "Over wins when the combined score is above the line. Under wins when it is below.",
  },
};

export function offerEntryGuidance(market: Market): OfferEntryGuidance {
  return GUIDANCE[market];
}

export class OfferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfferError";
  }
}

function requireTime(value: string, label: string): number {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    throw new OfferError(`Invalid ${label}`);
  }
  return time;
}

export function parseOffer(input: OfferInput): Offer {
  const observed = requireTime(input.observedAt, "observation time");
  const kickoff = requireTime(input.kickoffAt, "kickoff");
  if (observed >= kickoff) {
    throw new OfferError("The game has already started");
  }
  if (!input.gameId || !input.sportsbook) {
    throw new OfferError("Game and sportsbook are required");
  }

  let decimalOdds: number;
  try {
    decimalOdds = americanToDecimal(input.americanOdds);
  } catch (error) {
    if (error instanceof PriceError) {
      throw new OfferError(error.message);
    }
    throw error;
  }

  const needsLine = input.market === "spread" || input.market === "total";
  if (needsLine && !Number.isFinite(input.pointLine)) {
    throw new OfferError(`A ${input.market} requires a point line`);
  }
  if (input.market === "moneyline" && input.rules.tie === undefined) {
    throw new OfferError("A moneyline requires a tie rule");
  }
  if (input.market === "spread" && input.selection !== "home" && input.selection !== "away") {
    throw new OfferError("A spread selection must be home or away");
  }
  if (input.market === "total" && input.selection !== "over" && input.selection !== "under") {
    throw new OfferError("A total selection must be over or under");
  }
  if (input.market === "moneyline" && input.selection !== "home" && input.selection !== "away") {
    throw new OfferError("A moneyline selection must be home or away");
  }

  if (input.opposing) {
    const sameBook = input.opposing.sportsbook === input.sportsbook;
    // The other side of home -3.5 is away +3.5; the other side of over 44.5 is under 44.5.
    const expectedLine =
      input.market === "spread" && input.pointLine !== undefined
        ? -input.pointLine
        : (input.pointLine ?? null);
    const sameLine = (input.opposing.pointLine ?? null) === expectedLine;
    const opposingObserved = requireTime(input.opposing.observedAt, "opposing observation time");
    const closeInTime = Math.abs(opposingObserved - observed) <= 15 * 60 * 1000;
    if (!sameBook || !sameLine || !closeInTime) {
      throw new OfferError("Opposing price is not comparable");
    }
    americanToDecimal(input.opposing.americanOdds);
  }

  return {
    gameId: input.gameId,
    sportsbook: input.sportsbook,
    market: input.market,
    selection: input.selection,
    pointLine: input.pointLine ?? null,
    americanOdds: input.americanOdds,
    decimalOdds,
    observedAt: input.observedAt,
    kickoffAt: input.kickoffAt,
    rules: {
      period: "full-game",
      overtime: "included",
      tie: input.rules.tie ?? null,
    },
    opposing: input.opposing ?? null,
  };
}
