import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { downloadSource, seasonOf, sourceStatus } from "../../src/lib/server/sources/downloads.ts";
import type { FetchLike } from "../../src/lib/server/sources/fetch.ts";

const SCHEDULE = readFileSync("tests/fixtures/sources/games-minimized.csv", "utf8");
const INJURIES = readFileSync("tests/fixtures/sources/injuries-2026-live-sample.csv", "utf8");
const DEPTH = [
  "dt,team,player_name,espn_id,gsis_id,pos_grp_id,pos_grp,pos_id,pos_name,pos_abb,pos_slot,pos_rank",
  "2025-11-02T07:13:47Z,PHI,Jalen Hurts,4040715,00-0036389,21,3WR 1TE,8,Quarterback,QB,9,1",
].join("\n");
const NOW = "2026-11-01T15:00:00.000Z";

function serving(body: string, requested: string[] = []): FetchLike {
  return async (url) => {
    requested.push(url);
    return { ok: true, text: async () => body };
  };
}

const failing: FetchLike = async () => ({ ok: false, text: async () => "" });

function directory() {
  return mkdtempSync(join(tmpdir(), "pocketcheck-downloads-"));
}

describe("source downloads", () => {
  it("writes the file and its retrieval record, leaving no temporary files", async () => {
    const dir = directory();
    const output = join(dir, "injuries_2026.csv");
    const requested: string[] = [];
    const result = await downloadSource("injuries", {
      season: 2026,
      output,
      fetch: serving(INJURIES, requested),
      now: () => NOW,
    });
    expect(result.ok).toBe(true);
    expect(requested).toEqual([
      "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2026.csv",
    ]);
    expect(readFileSync(output, "utf8")).toBe(INJURIES);
    const record = JSON.parse(readFileSync(`${output}.json`, "utf8"));
    expect(record).toMatchObject({ source: requested[0], retrievedAt: NOW });
    expect(record.rows).toBe(INJURIES.split(/\r?\n/).filter((line) => line.length > 0).length - 1);
    expect(readdirSync(dir).sort()).toEqual(["injuries_2026.csv", "injuries_2026.csv.json"]);
  });

  it("keeps the existing file and record when the download fails or has the wrong columns", async () => {
    const dir = directory();
    const output = join(dir, "injuries_2026.csv");
    writeFileSync(output, "old");
    writeFileSync(`${output}.json`, '{"retrievedAt":"2026-10-30T12:00:00.000Z"}');
    for (const fetch of [failing, serving("name,value\na,1")]) {
      const result = await downloadSource("injuries", {
        season: 2026,
        output,
        fetch,
        now: () => NOW,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failure).toMatch(/existing file, if any, is unchanged/);
      expect(readFileSync(output, "utf8")).toBe("old");
      expect(readFileSync(`${output}.json`, "utf8")).toContain("2026-10-30T12:00:00.000Z");
    }
    expect(readdirSync(dir).sort()).toEqual(["injuries_2026.csv", "injuries_2026.csv.json"]);
  });

  it("checks each source's own columns", async () => {
    const dir = directory();
    const schedule = await downloadSource("schedule", {
      season: 2026,
      output: join(dir, "games.csv"),
      fetch: serving(SCHEDULE),
      now: () => NOW,
    });
    const depth = await downloadSource("depth-charts", {
      season: 2026,
      output: join(dir, "depth_charts_2026.csv"),
      fetch: serving(DEPTH),
      now: () => NOW,
    });
    const wrong = await downloadSource("schedule", {
      season: 2026,
      output: join(dir, "other.csv"),
      fetch: serving(INJURIES),
      now: () => NOW,
    });
    expect([schedule.ok, depth.ok, wrong.ok]).toEqual([true, true, false]);
    expect(existsSync(join(dir, "other.csv"))).toBe(false);
  });

  it("refuses a second download of the same file while one is running", async () => {
    const dir = directory();
    const output = join(dir, "games.csv");
    let release!: () => void;
    const slow: FetchLike = () =>
      new Promise((resolve) => {
        release = () => resolve({ ok: true, text: async () => SCHEDULE });
      });
    const first = downloadSource("schedule", { season: 2026, output, fetch: slow, now: () => NOW });
    const second = await downloadSource("schedule", {
      season: 2026,
      output,
      fetch: serving(SCHEDULE),
      now: () => NOW,
    });
    expect(second).toEqual({
      ok: false,
      failure: "A schedule download is already running. The existing file, if any, is unchanged.",
    });
    release();
    expect((await first).ok).toBe(true);
  });

  it("names the season a date belongs to", () => {
    expect(seasonOf("2026-11-01T15:00:00Z")).toBe(2026);
    expect(seasonOf("2027-01-20T15:00:00Z")).toBe(2026);
    expect(seasonOf("2027-03-01T15:00:00Z")).toBe(2027);
  });
});

describe("source status", () => {
  it("reports a missing file as missing", () => {
    expect(sourceStatus("injuries", join(directory(), "injuries_2026.csv"), NOW)).toEqual({
      state: "missing",
    });
  });

  it("reports retrieval time, rows, age, and whether injury coverage is stale", () => {
    const dir = directory();
    const output = join(dir, "injuries_2026.csv");
    writeFileSync(output, INJURIES);
    writeFileSync(
      `${output}.json`,
      JSON.stringify({ retrievedAt: "2026-10-31T09:00:00.000Z", rows: 12 }),
    );
    expect(sourceStatus("injuries", output, NOW)).toEqual({
      state: "present",
      retrievedAt: "2026-10-31T09:00:00.000Z",
      rows: 12,
      ageHours: 30,
      stale: true,
    });
    expect(sourceStatus("injuries", output, "2026-10-31T20:00:00.000Z")).toMatchObject({
      ageHours: 11,
      stale: false,
    });
    expect(sourceStatus("schedule", output, NOW)).toMatchObject({ ageHours: 30, stale: false });
  });

  it("keeps the row count unknown when the file has no retrieval record", () => {
    const output = join(directory(), "games.csv");
    writeFileSync(output, SCHEDULE);
    expect(sourceStatus("schedule", output, NOW)).toMatchObject({ state: "present", rows: null });
  });
});
