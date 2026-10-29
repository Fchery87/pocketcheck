import { proportionalMargin } from "../../domain/odds.ts";
import { marginMeanForHomeWin } from "./distribution.ts";
import type { ResidualDistribution } from "./distribution.ts";
import type { Market } from "./games.ts";

/**
 * Where a forecast starts. The model learns only how far to move from this mean. Without both
 * sides from one sportsbook there is no anchor, and then there is no forecast.
 */
export type AnchorLine = {
  market: Market;
  /** The sportsbook whose two sides produced the anchor. Never mixed across books. */
  sportsbook: string;
  /** No-vig home win probability for a moneyline, otherwise null. */
  noVigHome: number | null;
  /** Implied mean margin for moneyline and spread, implied mean total for a total. */
  mean: number;
};

export type AnchorQuote = {
  sportsbook: string;
  homeAmerican: number;
  awayAmerican: number;
  /** Home spread line, or the total. Absent for a moneyline. */
  line?: number;
};

export function anchorFromQuote(
  market: Market,
  quote: AnchorQuote,
  marginDistribution: ResidualDistribution,
): AnchorLine {
  const fair = proportionalMargin([
    { side: "home", american: quote.homeAmerican },
    { side: "away", american: quote.awayAmerican },
  ]);
  if (!fair.available) {
    throw new Error(`${market} has no two-sided quote, so it has no anchor line and no forecast.`);
  }
  if (market === "total") {
    if (quote.line === undefined) {
      throw new Error("A total anchor needs the total line.");
    }
    return {
      market,
      sportsbook: quote.sportsbook,
      noVigHome: null,
      mean: quote.line,
    };
  }
  if (market === "spread") {
    if (quote.line === undefined) throw new Error("A spread anchor needs the home line.");
    return {
      market,
      sportsbook: quote.sportsbook,
      noVigHome: null,
      mean: quote.line,
    };
  }
  const home = fair.probabilities.home ?? 0;
  return {
    market,
    sportsbook: quote.sportsbook,
    noVigHome: home,
    mean: marginMeanForHomeWin(marginDistribution, home),
  };
}
