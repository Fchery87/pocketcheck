import { easternKickoffUtc, parseCsv } from "../sources/nflverse.ts";
import type { HistoricalPrices, PricedGame } from "./games.ts";

function numberOrNull(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pricesOf(row: Record<string, string>): HistoricalPrices {
  const prices: HistoricalPrices = {};
  const homeMoneyline = numberOrNull(row.home_moneyline);
  const awayMoneyline = numberOrNull(row.away_moneyline);
  if (homeMoneyline !== null && awayMoneyline !== null) {
    prices.moneyline = { home: { american: homeMoneyline }, away: { american: awayMoneyline } };
  }
  // nflverse spread_line is how many points the home team is favored by.
  const spreadLine = numberOrNull(row.spread_line);
  const homeSpread = numberOrNull(row.home_spread_odds);
  const awaySpread = numberOrNull(row.away_spread_odds);
  if (spreadLine !== null && homeSpread !== null && awaySpread !== null) {
    prices.spread = {
      line: spreadLine === 0 ? 0 : -spreadLine,
      home: { american: homeSpread },
      away: { american: awaySpread },
    };
  }
  const totalLine = numberOrNull(row.total_line);
  const over = numberOrNull(row.over_odds);
  const under = numberOrNull(row.under_odds);
  if (totalLine !== null && over !== null && under !== null) {
    prices.total = { line: totalLine, over: { american: over }, under: { american: under } };
  }
  return prices;
}

/** Finished games from the nflverse schedule, with the closing prices it records. */
export function pricedGamesFromNflverseCsv(csv: string): PricedGame[] {
  const games: PricedGame[] = [];
  for (const row of parseCsv(csv)) {
    const homeScore = numberOrNull(row.home_score);
    const awayScore = numberOrNull(row.away_score);
    if (homeScore === null || awayScore === null) continue;
    if (!row.gameday || !row.gametime) continue;
    games.push({
      id: row.game_id ?? "",
      season: Number(row.season),
      kickoff: easternKickoffUtc(row.gameday, row.gametime),
      home: row.home_team ?? "",
      away: row.away_team ?? "",
      homeScore,
      awayScore,
      neutral: row.location === "Neutral",
      prices: pricesOf(row),
    });
  }
  return games;
}
