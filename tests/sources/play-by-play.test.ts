import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";
import {
  PLAY_BY_PLAY_LICENSE,
  teamSummariesFromPlayByPlay,
  teamSummariesFromSeasonFiles,
} from "../../src/lib/server/sources/play-by-play.ts";

const sample = readFileSync(
  new URL("../fixtures/sources/play-by-play-sample.csv", import.meta.url),
  "utf8",
);

describe("play-by-play summaries", () => {
  it("keeps PROE and yards available when EPA is missing", () => {
    const read = teamSummariesFromPlayByPlay(
      [
        "game_id,posteam,defteam,play_type,epa,season,week,pass_oe,yards_gained",
        "g,A,B,pass,1,2024,1,40,25",
        "g,A,B,run,,2024,1,-60,",
      ].join("\n"),
    );
    expect(read.summaries[0]).toMatchObject({
      offensivePlays: 2,
      passRateOverExpected: -10,
      offenseEpaPerPlay: 1,
      explosiveRate: 1,
      successRate: 1,
    });
  });
  it("uses eligible scrimmage plays and all available PROE values", () => {
    const header =
      "game_id,posteam,defteam,play_type,epa,season,week,pass_oe,qb_kneel,qb_spike,qb_scramble,qb_dropback,yards_gained";
    const read = teamSummariesFromPlayByPlay(
      [
        header,
        "g,A,B,pass,1,2024,1,40,0,0,0,1,25",
        "g,A,B,run,-1,2024,1,-60,0,0,0,0,2",
        "g,A,B,run,2,2024,1,,0,0,1,1,4",
        "g,A,B,punt,99,2024,1,,0,0,0,0,30",
        "g,A,B,run,99,2024,1,,1,0,0,0,0",
        "g,A,B,pass,99,2024,1,,0,1,0,1,0",
      ].join("\n"),
    );
    expect(read.summaries[0]).toMatchObject({ offensivePlays: 3, passRateOverExpected: -10 });
    expect(read.summaries[0]?.offenseEpaPerPlay).toBeCloseTo(2 / 3);
    expect(read.summaries[0]?.passEpaPerPlay).toBeCloseTo(1.5);
    expect(read.summaries[0]?.explosiveRate).toBeCloseTo(1 / 3);
  });
  const read = teamSummariesFromPlayByPlay(sample);
  const home = read.summaries.find((summary) => summary.team === "A");

  it("keeps the license with the source", () => {
    expect(PLAY_BY_PLAY_LICENSE).toMatchObject({
      name: "CC BY 4.0",
      attribution: "nflverse",
    });
  });

  it("uses offensive plays as the denominator", () => {
    expect(read.gaps).toEqual([]);
    expect(home).toMatchObject({
      gameId: "2024_01_A_B",
      offensivePlays: 4,
      defensivePlays: 2,
      turnovers: 1,
      fumbleRecoveries: 1,
    });
    // Two of A's four rated plays have positive EPA.
    expect(home?.successRate).toBeCloseTo(0.5, 6);
    // EPA sums to 1 - 0.5 + 0.4 - 2 = -1.1 over four rated plays.
    expect(home?.offenseEpaPerPlay).toBeCloseTo(-1.1 / 4, 6);
    // One of four offensive plays gained 20 or more.
    expect(home?.explosiveRate).toBeCloseTo(0.25, 6);
    // The kickoff has no offense, so it is not a play for either team.
    expect(read.summaries).toHaveLength(2);
  });
});

describe("play-by-play season files", () => {
  const directory = mkdtempSync(join(tmpdir(), "pocketcheck-pbp-"));
  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  it("reports a gap for an empty or missing file and keeps the other season", () => {
    const good = join(directory, "2024.csv");
    const empty = join(directory, "2023.csv");
    writeFileSync(good, sample);
    writeFileSync(empty, "");
    const read = teamSummariesFromSeasonFiles([
      { season: 2024, path: good },
      { season: 2023, path: empty },
      { season: 2022, path: join(directory, "does-not-exist.csv") },
    ]);
    expect(read.summaries).toHaveLength(2);
    expect(read.gaps.join(" ")).toMatch(/2023/);
    expect(read.gaps.join(" ")).toMatch(/2022/);
  });
  it("rejects old summary semantics with unchanged source metadata", () => {
    const path = join(directory, "cached.csv");
    writeFileSync(path, sample);
    const fresh = teamSummariesFromSeasonFiles([{ season: 2024, path }]);
    const cache = JSON.parse(readFileSync(`${path}.summary.json`, "utf8"));
    cache.version = 1;
    cache.summaries[0].passRateOverExpected = 999;
    writeFileSync(`${path}.summary.json`, JSON.stringify(cache));
    expect(teamSummariesFromSeasonFiles([{ season: 2024, path }])).toEqual(fresh);
    expect(JSON.parse(readFileSync(`${path}.summary.json`, "utf8")).version).toBe(2);
  });
});
