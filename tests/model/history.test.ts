import { describe, expect, it } from "vite-plus/test";
import { pricedGamesFromNflverseCsv } from "../../src/lib/server/models/history.ts";

const HEADER =
  "game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,location,result,total,overtime,old_game_id,gsis,nfl_detail_id,pfr,pff,espn,ftn,away_rest,home_rest,away_moneyline,home_moneyline,spread_line,away_spread_odds,home_spread_odds,total_line,under_odds,over_odds,div_game,roof,surface,temp,wind,away_qb_id,home_qb_id,away_qb_name,home_qb_name,away_coach,home_coach,referee,stadium_id,stadium";

function row(values: Record<string, string>): string {
  return HEADER.split(",")
    .map((column) => values[column] ?? "")
    .join(",");
}

const csv = [
  HEADER,
  row({
    game_id: "2023_01_DET_KC",
    season: "2023",
    gameday: "2023-09-07",
    gametime: "20:20",
    away_team: "DET",
    away_score: "21",
    home_team: "KC",
    home_score: "20",
    location: "Home",
    away_moneyline: "164",
    home_moneyline: "-198",
    spread_line: "4.5",
    away_spread_odds: "-110",
    home_spread_odds: "-110",
    total_line: "53",
    under_odds: "-110",
    over_odds: "-110",
  }),
  row({
    game_id: "2023_04_JAX_ATL",
    season: "2023",
    gameday: "2023-10-01",
    gametime: "09:30",
    away_team: "JAX",
    away_score: "23",
    home_team: "ATL",
    home_score: "7",
    location: "Neutral",
  }),
  row({
    game_id: "2026_07_DAL_PHI",
    season: "2026",
    gameday: "2026-10-25",
    gametime: "20:20",
    away_team: "DAL",
    home_team: "PHI",
    location: "Home",
    spread_line: "3",
  }),
].join("\n");

describe("historical games from the nflverse schedule", () => {
  const games = pricedGamesFromNflverseCsv(csv);

  it("keeps only finished games, with season and neutral site", () => {
    expect(games.map((game) => game.id)).toEqual(["2023_01_DET_KC", "2023_04_JAX_ATL"]);
    expect(games[0]).toMatchObject({
      season: 2023,
      home: "KC",
      away: "DET",
      homeScore: 20,
      awayScore: 21,
      neutral: false,
      kickoff: "2023-09-08T00:20:00.000Z",
    });
    expect(games[1]?.neutral).toBe(true);
  });

  it("reads closing prices, with the spread from the home side", () => {
    expect(games[0]?.prices).toEqual({
      moneyline: { home: { american: -198 }, away: { american: 164 } },
      spread: { line: -4.5, home: { american: -110 }, away: { american: -110 } },
      total: { line: 53, over: { american: -110 }, under: { american: -110 } },
    });
  });

  it("leaves missing prices missing", () => {
    expect(games[1]?.prices).toEqual({});
  });
});
