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
});
