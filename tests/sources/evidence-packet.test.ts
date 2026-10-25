import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { checksumOf } from "../../src/lib/server/sources/cache.ts";
import { fetchBounded } from "../../src/lib/server/sources/fetch.ts";
import { injuryEvidenceFromCsv } from "../../src/lib/server/sources/injuries.ts";
import { createManualEvidence } from "../../src/lib/server/sources/manual.ts";
import { scheduleGamesFromCsv } from "../../src/lib/server/sources/nflverse.ts";
import { assembleEvidencePacket } from "../../src/lib/server/sources/packet.ts";
import { kickoffForecastEvidence } from "../../src/lib/server/sources/weather.ts";

const scheduleCsv = readFileSync(
  new URL("../fixtures/sources/games-minimized.csv", import.meta.url),
  "utf8",
);
const injuryCsv = readFileSync(
  new URL("../fixtures/sources/injuries-2026-sample.csv", import.meta.url),
  "utf8",
);
const nwsPayload = JSON.parse(
  readFileSync(new URL("../fixtures/sources/nws-lumen.json", import.meta.url), "utf8"),
);

const retrievedAt = "2026-10-25T18:00:00.000Z";

describe("schedule evidence", () => {
  it("converts a future game kickoff with America/New_York and does not invent a score", () => {
    const games = scheduleGamesFromCsv(scheduleCsv, { retrievedAt });
    const monday = games.find((game) => game.id === "2026_07_DAL_PHI");
    expect(monday).toMatchObject({
      id: "2026_07_DAL_PHI",
      home: "PHI",
      away: "DAL",
      venue: { name: "Lincoln Financial Field", stadiumId: "PHI00", roof: "outdoors" },
      kickoff: "2026-10-27T00:15:00.000Z",
      finalScore: null,
    });
    const afterFallback = games.find((game) => game.id === "2026_08_BAL_BUF");
    expect(afterFallback?.kickoff).toBe("2026-11-01T18:00:00.000Z");
  });

  it("states the home line from nflverse spread_line and never as a selected-team offer", () => {
    const games = scheduleGamesFromCsv(scheduleCsv, { retrievedAt });
    const homeFavored = games.find((game) => game.id === "2026_08_BAL_BUF");
    const homeDog = games.find((game) => game.id === "2026_07_DAL_PHI");
    expect(homeFavored?.scheduleSpread).toEqual({
      nflverseSpreadLine: 3.5,
      homeFavored: true,
      homeLine: -3.5,
      display: "home -3.5",
    });
    expect(homeDog?.scheduleSpread).toEqual({
      nflverseSpreadLine: -4.5,
      homeFavored: false,
      homeLine: 4.5,
      display: "home +4.5",
    });
    expect(homeFavored).not.toHaveProperty("selectedTeamLine");
    expect(homeDog).not.toHaveProperty("selectedTeamLine");
  });
});

describe("injury evidence", () => {
  it("keeps a sampled 2026 row and shows that publication time is unknown", () => {
    const result = injuryEvidenceFromCsv(injuryCsv, {
      season: 2026,
      week: 7,
      teams: ["PHI"],
      retrievedAt,
      sourceUrl:
        "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2026.csv",
    });
    expect(result.gaps.join(" ")).toMatch(/publication time/i);
    expect(result.items).toEqual([
      expect.objectContaining({
        origin: "automatic",
        publishedAt: "unknown",
        facts: expect.objectContaining({
          season: 2026,
          team: "PHI",
          player: "Jalen Hurts",
          reportStatus: "Questionable",
        }),
      }),
    ]);
    expect(JSON.stringify(result.items)).not.toContain("Old Season");
  });

  it("does not treat a 2024 payload as 2026 coverage", () => {
    const onlyOld = injuryCsv
      .split("\n")
      .filter((line) => !line.startsWith("2026,"))
      .join("\n");
    const result = injuryEvidenceFromCsv(onlyOld, {
      season: 2026,
      week: 7,
      teams: ["PHI"],
      retrievedAt,
      sourceUrl: "https://example.test/injuries_2024.csv",
    });
    expect(result.items).toEqual([]);
    expect(result.gaps.join(" ")).toMatch(/2026/);
    expect(result.gaps.join(" ")).toMatch(/manual/i);
  });
});

describe("weather evidence", () => {
  it("selects the forecast period that contains kickoff for an outdoor venue", () => {
    const item = kickoffForecastEvidence({
      roof: "outdoors",
      kickoff: "2026-10-27T00:15:00.000Z",
      payload: nwsPayload,
      retrievedAt,
      sourceUrl: "https://api.weather.gov/gridpoints/SEW/example/forecast/hourly",
    });
    expect(item.state).toBe("applicable");
    expect(item.item).toMatchObject({
      origin: "automatic",
      publishedAt: "2026-10-25T20:00:00.000Z",
      facts: {
        temperatureF: 58,
        wind: "SW 10 mph",
        shortForecast: "Partly Cloudy",
        periodStart: "2026-10-26T22:00:00.000Z",
        periodEnd: "2026-10-27T01:00:00.000Z",
      },
    });
  });

  it("does not apply an outdoor forecast when the roof is closed", () => {
    const item = kickoffForecastEvidence({
      roof: "dome",
      kickoff: "2026-10-25T20:25:00.000Z",
      payload: nwsPayload,
      retrievedAt,
      sourceUrl: "https://api.weather.gov/gridpoints/DTX/example/forecast/hourly",
    });
    expect(item.state).toBe("irrelevant");
    expect(item.item).toBeNull();
    expect(item.reason).toMatch(/roof/i);
  });

  it("reports a visible gap when the point has no forecast coverage", () => {
    const item = kickoffForecastEvidence({
      roof: "outdoors",
      kickoff: "2026-10-27T00:15:00.000Z",
      payload: { properties: { periods: [] } },
      retrievedAt,
      sourceUrl: null,
    });
    expect(item.state).toBe("missing");
    expect(item.item).toBeNull();
    expect(item.reason).toMatch(/coverage|no forecast/i);
  });
});

describe("manual evidence and packet cutoff", () => {
  it("requires text or url, a source time or unknown, entry time, and manual origin", () => {
    expect(() =>
      createManualEvidence({
        text: "",
        url: "",
        sourceTime: "unknown",
        enteredAt: retrievedAt,
      }),
    ).toThrow(/text or url/i);

    const item = createManualEvidence({
      text: "Jalen Hurts is listed as questionable (ankle) on the club report.",
      url: "https://www.philadelphiaeagles.com/news/example-injury-report",
      sourceTime: "unknown",
      enteredAt: retrievedAt,
      factKey: "availability:PHI:Jalen Hurts",
      facts: { team: "PHI", player: "Jalen Hurts", reportStatus: "Questionable" },
    });
    expect(item).toMatchObject({
      origin: "manual",
      publishedAt: "unknown",
      retrievedAt,
      url: "https://www.philadelphiaeagles.com/news/example-injury-report",
    });
  });

  it("freezes a cutoff, drops later facts, and keeps conflicts and unknown times visible", () => {
    const games = scheduleGamesFromCsv(scheduleCsv, { retrievedAt });
    const game = games.find((entry) => entry.id === "2026_07_DAL_PHI");
    const injuries = injuryEvidenceFromCsv(injuryCsv, {
      season: 2026,
      week: 7,
      teams: ["PHI"],
      retrievedAt,
      sourceUrl:
        "https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2026.csv",
    });
    const manual = createManualEvidence({
      text: "Club report lists Jalen Hurts out.",
      url: "https://www.philadelphiaeagles.com/news/example-injury-report",
      sourceTime: "2026-10-25T12:00:00.000Z",
      enteredAt: retrievedAt,
      factKey: "availability:PHI:Jalen Hurts",
      facts: { team: "PHI", player: "Jalen Hurts", reportStatus: "Out" },
    });
    const late = createManualEvidence({
      text: "Post-cutoff note.",
      sourceTime: "2026-10-26T12:00:00.000Z",
      enteredAt: "2026-10-26T12:00:00.000Z",
      factKey: "note:late",
      facts: { note: "after cutoff" },
    });
    if (!game) throw new Error("fixture game missing");
    const packet = assembleEvidencePacket({
      game,
      decisionCutoff: "2026-10-25T20:00:00.000Z",
      items: [...injuries.items, manual, late],
      gaps: injuries.gaps,
    });
    expect(packet.decisionCutoff).toBe("2026-10-25T20:00:00.000Z");
    expect(packet.items.map((item) => item.facts)).not.toContainEqual(
      expect.objectContaining({ note: "after cutoff" }),
    );
    expect(packet.rejectedAfterCutoff).toHaveLength(1);
    expect(packet.conflicts).toEqual([
      expect.objectContaining({ factKey: "availability:PHI:Jalen Hurts" }),
    ]);
    expect(packet.gaps.join(" ")).toMatch(/publication time/i);
    expect(packet.items.some((item) => item.publishedAt === "unknown")).toBe(true);
  });

  it("refuses a game that has already kicked off by the decision cutoff", () => {
    const games = scheduleGamesFromCsv(scheduleCsv, { retrievedAt: "2026-09-11T02:00:00.000Z" });
    const started = games.find((game) => game.id === "2026_01_OLD_GAME");
    if (!started) throw new Error("started fixture missing");
    const packet = assembleEvidencePacket({
      game: started,
      decisionCutoff: "2026-09-11T02:00:00.000Z",
      items: [],
      gaps: [],
    });
    expect(packet.game).toBeNull();
    expect(packet.gaps.join(" ")).toMatch(/cutoff|started/i);
  });
});

describe("bounded fetch and cache", () => {
  it("records a checksum for cached bytes", () => {
    expect(checksumOf("abc")).toMatch(/^[a-f0-9]{64}$/);
    expect(checksumOf("abc")).not.toBe(checksumOf("abd"));
  });

  it("surfaces a timeout without calling the network helper again", async () => {
    const result = await fetchBounded("https://example.test/schedule.csv", {
      timeoutMs: 20,
      fetch: () => new Promise(() => {}),
      schema: "csv",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toMatch(/timeout/i);
  });

  it("surfaces a schema mismatch as a visible failure", async () => {
    const result = await fetchBounded("https://example.test/schedule.csv", {
      timeoutMs: 50,
      fetch: async () => ({
        ok: true,
        text: async () => "not,a,schedule\n1,2,3\n",
      }),
      schema: "nflverse-games",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toMatch(/schema/i);
  });
});
