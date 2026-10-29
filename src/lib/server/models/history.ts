import { easternKickoffUtc, parseCsv } from "../sources/nflverse.ts";
import type { UpcomingGame } from "./features.ts";
import type { GameVenue, HistoricalPrices, PricedGame } from "./games.ts";

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

/** The stadium each club hosted most of its non-neutral games in, by season: where its trips start. */
function homeBases(rows: readonly Record<string, string>[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (row.location === "Neutral" || !row.stadium_id || !row.home_team) continue;
    const key = `${row.season}|${row.home_team}`;
    const byStadium = counts.get(key) ?? new Map<string, number>();
    byStadium.set(row.stadium_id, (byStadium.get(row.stadium_id) ?? 0) + 1);
    counts.set(key, byStadium);
  }
  const bases = new Map<string, string>();
  for (const [key, byStadium] of counts) {
    bases.set(key, [...byStadium.entries()].sort((a, b) => b[1] - a[1])[0]![0]);
  }
  return bases;
}

function venueOfRow(row: Record<string, string>, bases: Map<string, string>): GameVenue | null {
  if (!row.stadium_id) return null;
  const homeBaseId = bases.get(`${row.season}|${row.home_team}`);
  const awayBaseId = bases.get(`${row.season}|${row.away_team}`);
  return {
    stadiumId: row.stadium_id,
    roof: row.roof ?? "",
    surface: (row.surface ?? "").trim(),
    ...(homeBaseId ? { homeBaseId } : {}),
    ...(awayBaseId ? { awayBaseId } : {}),
  };
}

/** Finished games from the nflverse schedule, with the closing prices it records. */
export function pricedGamesFromNflverseCsv(csv: string): PricedGame[] {
  const games: PricedGame[] = [];
  const all = parseCsv(csv);
  const bases = homeBases(all);
  for (const row of all) {
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
      ...(row.home_qb_id ? { homeQb: row.home_qb_id } : {}),
      ...(row.away_qb_id ? { awayQb: row.away_qb_id } : {}),
      prices: pricesOf(row),
      ...(venueOfRow(row, bases) ? { venue: venueOfRow(row, bases)! } : {}),
    });
  }
  return games;
}

/** One scheduled game's model inputs before kickoff: site and any listed starting quarterbacks. */
export function upcomingGameFromCsv(csv: string, gameId: string): UpcomingGame | null {
  const all = parseCsv(csv);
  const row = all.find((candidate) => candidate.game_id === gameId);
  if (!row || !row.gameday || !row.gametime) return null;
  const venue = venueOfRow(row, homeBases(all));
  return {
    id: gameId,
    season: Number(row.season),
    kickoff: easternKickoffUtc(row.gameday, row.gametime),
    home: row.home_team ?? "",
    away: row.away_team ?? "",
    neutral: row.location === "Neutral",
    ...(row.home_qb_id ? { homeQb: row.home_qb_id } : {}),
    ...(row.away_qb_id ? { awayQb: row.away_qb_id } : {}),
    ...(venue ? { venue } : {}),
  };
}
