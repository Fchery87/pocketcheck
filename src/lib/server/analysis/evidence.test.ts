import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { scheduleGamesFromCsv } from "../sources/nflverse.ts";
import type { WeatherEvidence } from "../sources/weather.ts";
import { createSourceCollector } from "./evidence.ts";

const fixtures = new URL("../../../../tests/fixtures/sources/", import.meta.url);
const games = scheduleGamesFromCsv(readFileSync(new URL("games-minimized.csv", fixtures), "utf8"), {
  retrievedAt: "2026-10-25T12:00:00.000Z",
});
const phi = games.find((game) => game.id === "2026_07_DAL_PHI")!;
const buf = games.find((game) => game.id === "2026_08_BAL_BUF")!;
const nowIso = "2026-10-25T21:00:00.000Z";

/** A cached injury file as npm run data:injuries leaves it. */
function injuryCache(retrievedAt: string) {
  const dir = mkdtempSync(join(tmpdir(), "pocketcheck-injuries-"));
  const path = join(dir, "injuries_2026.csv");
  copyFileSync(new URL("injuries-2026-live-sample.csv", fixtures), path);
  writeFileSync(
    `${path}.json`,
    JSON.stringify({
      source:
        "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2026.csv",
      retrievedAt,
    }),
  );
  return () => path;
}

const forecast = (result: WeatherEvidence) => async () => result;
const noForecast = forecast({ state: "missing", item: null, reason: "No forecast coverage." });

describe("source evidence collector", () => {
  it("reads both teams' rows for the game week from the cached injury file", async () => {
    const collect = createSourceCollector({
      injuryPath: injuryCache("2026-10-25T18:00:00.000Z"),
      weather: noForecast,
    });
    const collected = await collect(phi, nowIso);
    const injuries = collected.items.filter((item) => item.sourceId === "nflverse-injuries");
    expect(injuries.map((item) => item.facts.player)).toEqual([
      "Saquon Barkley",
      "Jonathan Greenard",
      "Michael Carter II",
    ]);
    expect(injuries.every((item) => item.retrievedAt === "2026-10-25T18:00:00.000Z")).toBe(true);
    expect(injuries[0]?.url).toContain("injuries_2026.csv");
    // Unknown publication time is a caveat, not missing evidence.
    expect(collected.gaps.join(" ")).toMatch(/publication time/);
    expect(collected.materialGaps.join(" ")).not.toMatch(/publication time|injur/i);
  });

  it("treats a missing injury file as missing material evidence", async () => {
    const collect = createSourceCollector({
      injuryPath: () => "/nonexistent/injuries_2026.csv",
      weather: noForecast,
    });
    const collected = await collect(phi, nowIso);
    expect(collected.materialGaps.join(" ")).toMatch(/npm run data:injuries/);
  });

  it("treats a file with no rows for the game week as missing material evidence", async () => {
    const collect = createSourceCollector({
      injuryPath: injuryCache("2026-10-25T18:00:00.000Z"),
      weather: noForecast,
    });
    const collected = await collect(buf, nowIso);
    expect(collected.items.some((item) => item.sourceId === "nflverse-injuries")).toBe(false);
    expect(collected.materialGaps.join(" ")).toMatch(/week 8 injury rows/);
  });

  it("flags an injury file older than a day without blocking on it", async () => {
    const collect = createSourceCollector({
      injuryPath: injuryCache("2026-10-23T12:00:00.000Z"),
      weather: noForecast,
    });
    const collected = await collect(phi, nowIso);
    expect(collected.gaps.join(" ")).toMatch(/retrieved .* re-run npm run data:injuries/i);
    expect(collected.materialGaps.join(" ")).not.toMatch(/re-run/);
  });

  it("adds an applicable forecast and treats a missing outdoor forecast as material", async () => {
    const item = {
      id: "nws-forecast-1",
      sourceId: "nws-forecast",
      url: "https://api.weather.gov/gridpoints/PHI/50,76/forecast/hourly",
      retrievedAt: nowIso,
      publishedAt: "2026-10-25T20:00:00.000Z",
      origin: "automatic" as const,
      facts: { wind: "SW 10 mph" },
      excerpt: null,
      checksum: null,
      factKey: "weather:kickoff",
    };
    const withForecast = await createSourceCollector({
      injuryPath: injuryCache("2026-10-25T18:00:00.000Z"),
      weather: forecast({ state: "applicable", item, reason: null }),
    })(phi, nowIso);
    expect(withForecast.items).toContainEqual(item);
    expect(withForecast.materialGaps.join(" ")).not.toMatch(/forecast/i);

    const without = await createSourceCollector({
      injuryPath: injuryCache("2026-10-25T18:00:00.000Z"),
      weather: noForecast,
    })(phi, nowIso);
    expect(without.materialGaps.join(" ")).toMatch(/No forecast coverage/);
  });

  it("notes a closed roof without counting weather as missing", async () => {
    const collected = await createSourceCollector({
      injuryPath: injuryCache("2026-10-25T18:00:00.000Z"),
      weather: forecast({ state: "irrelevant", item: null, reason: "Roof is dome." }),
    })(phi, nowIso);
    expect(collected.gaps).toContain("Roof is dome.");
    expect(collected.materialGaps).not.toContain("Roof is dome.");
  });
});
