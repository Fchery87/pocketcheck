import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { readGames } from "../../src/lib/server/models/train.ts";

const HEADER =
  "game_id,season,game_type,week,gameday,gametime,away_team,away_score,home_team,home_score,location,result,total,away_moneyline,home_moneyline,spread_line,away_spread_odds,home_spread_odds,total_line,under_odds,over_odds";

function schedule(seasons: number[]): string {
  const rows = seasons.map(
    (season) =>
      `${season}_01_AAA_BBB,${season},REG,1,${season}-09-10,13:00,AAA,17,BBB,20,Home,3,37,130,-150,3,-110,-110,44,-110,-110`,
  );
  return [HEADER, ...rows].join("\n");
}

describe("history window", () => {
  it("starts at the first season with play-by-play beside the schedule", () => {
    const directory = mkdtempSync(join(tmpdir(), "pocketcheck-games-"));
    const path = join(directory, "games.csv");
    writeFileSync(path, schedule([2015, 2016, 2017]));
    expect(readGames(path).map((game) => game.season)).toEqual([2015, 2016, 2017]);
    writeFileSync(
      join(directory, "play_by_play_2016.csv"),
      "game_id,posteam,defteam,play_type,epa,season,week\n",
    );
    expect(readGames(path).map((game) => game.season)).toEqual([2016, 2017]);
  });
});
