import { proportionalMargin } from "../../domain/odds.ts";
import {
  ANCHOR_MAPPING,
  marginMeanForHomeWin,
  meanForDecisiveProbability,
  spreadFromMargin,
  totalFromDistribution,
} from "./distribution.ts";
import type { ResidualDistribution } from "./distribution.ts";
import type { Market } from "./games.ts";

/**
 * Where a forecast starts. The model learns only how far to move from this mean. Without both
 * sides from one sportsbook there is no anchor, and then there is no forecast.
 */
export type AnchorLine = {
  /** Omitted on historical saved forecasts. */
  mappingVersion?: typeof ANCHOR_MAPPING;
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

const mappedMeans = new WeakMap<ResidualDistribution, Map<string, number>>();

function matchedMean(
  distribution: ResidualDistribution,
  market: Market,
  probability: number,
  line: number | undefined,
): number {
  const key = `${market}:${probability}:${line ?? ""}`;
  const cache = mappedMeans.get(distribution) ?? new Map<string, number>();
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const mean =
    market === "moneyline"
      ? marginMeanForHomeWin(distribution, probability)
      : meanForDecisiveProbability(
          distribution,
          probability,
          market === "spread" ? marginFromHomeLine(line!) : line!,
          (bins) =>
            market === "spread"
              ? spreadFromMargin(bins, line!).home
              : totalFromDistribution(bins, line!).over,
        );
  cache.set(key, mean);
  mappedMeans.set(distribution, cache);
  return mean;
}

/**
 * The home margin a home spread line implies. A home line of -7 says the home team is expected
 * to win by 7, so the margin is the line's negation.
 */
export function marginFromHomeLine(homeLine: number): number {
  return homeLine === 0 ? 0 : -homeLine;
}

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
      mean: matchedMean(marginDistribution, market, fair.probabilities.home!, quote.line),
      mappingVersion: ANCHOR_MAPPING,
    };
  }
  if (market === "spread") {
    if (quote.line === undefined) throw new Error("A spread anchor needs the home line.");
    return {
      market,
      sportsbook: quote.sportsbook,
      noVigHome: null,
      mean: matchedMean(marginDistribution, market, fair.probabilities.home!, quote.line),
      mappingVersion: ANCHOR_MAPPING,
    };
  }
  const home = fair.probabilities.home ?? 0;
  return {
    market,
    sportsbook: quote.sportsbook,
    noVigHome: home,
    mean: matchedMean(marginDistribution, market, home, undefined),
    mappingVersion: ANCHOR_MAPPING,
  };
}
