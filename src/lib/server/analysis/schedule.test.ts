import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { readSchedule, upcomingGames } from "#lib/server/analysis/schedule.ts";

const FIXTURE = "tests/fixtures/sources/games-minimized.csv";

describe("schedule file", () => {
  it("lists only games that have not started, soonest first", () => {
    const schedule = readSchedule(FIXTURE);
    expect(schedule.ok).toBe(true);
    if (!schedule.ok) return;
    const ids = upcomingGames(schedule.games, "2026-10-25T16:00:00.000Z").map((game) => game.id);
    expect(ids).toEqual(["2026_07_GB_DET", "2026_07_DAL_PHI", "2026_08_BAL_BUF"]);
  });

  it("drops a game once its kickoff passes", () => {
    const schedule = readSchedule(FIXTURE);
    if (!schedule.ok) throw new Error(schedule.reason);
    const ids = upcomingGames(schedule.games, "2026-10-25T20:25:00.000Z").map((game) => game.id);
    expect(ids).not.toContain("2026_07_GB_DET");
  });

  it("explains how to get a schedule when the file is missing", () => {
    const schedule = readSchedule(join(tmpdir(), "pocketcheck-missing", "games.csv"));
    expect(schedule).toMatchObject({
      ok: false,
      reason: expect.stringContaining("npm run data:schedule"),
    });
  });

  it("takes the retrieval time from the download record when one exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "pocketcheck-schedule-"));
    const path = join(dir, "games.csv");
    writeFileSync(path, readFileSync(FIXTURE, "utf8"));
    writeFileSync(`${path}.json`, JSON.stringify({ retrievedAt: "2026-10-24T09:00:00.000Z" }));
    expect(readSchedule(path)).toMatchObject({ ok: true, retrievedAt: "2026-10-24T09:00:00.000Z" });
  });

  it("reports a schedule whose columns changed instead of guessing", () => {
    const dir = mkdtempSync(join(tmpdir(), "pocketcheck-schedule-"));
    const path = join(dir, "games.csv");
    writeFileSync(path, "game_id,season\n2026_01_A_B,2026\n");
    expect(readSchedule(path)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("schema mismatch"),
    });
  });
});
