import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import type { FetchLike } from "../../src/lib/server/sources/fetch.ts";
import { scheduleGamesFromCsv } from "../../src/lib/server/sources/nflverse.ts";
import { fetchKickoffForecast } from "../../src/lib/server/sources/nws.ts";
import type { ScheduledGame } from "../../src/lib/server/sources/contracts.ts";

const points = readFileSync(
  new URL("../fixtures/sources/nws-points-phi.json", import.meta.url),
  "utf8",
);
const hourly = readFileSync(new URL("../fixtures/sources/nws-lumen.json", import.meta.url), "utf8");
const scheduleCsv = readFileSync(
  new URL("../fixtures/sources/games-minimized.csv", import.meta.url),
  "utf8",
);

const nowIso = "2026-10-25T21:00:00.000Z";
const userAgent = "PocketCheck test (test@example.com)";
const games = scheduleGamesFromCsv(scheduleCsv, { retrievedAt: nowIso });
const outdoor = games.find((game) => game.id === "2026_07_DAL_PHI")!;
const dome = games.find((game) => game.id === "2026_07_GB_DET")!;

type Call = { url: string; headers: Record<string, string> };

function recorder(respond: (url: string) => { ok: boolean; body: string } | "hang") {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers ?? {} });
    const response = respond(url);
    if (response === "hang") return new Promise(() => {});
    return { ok: response.ok, text: async () => response.body };
  };
  return { fetch, calls };
}

const live = (url: string) =>
  url.includes("/points/") ? { ok: true, body: points } : { ok: true, body: hourly };

describe("NWS kickoff forecast", () => {
  it("resolves the stadium point, then reads the hourly forecast with an identifying User-Agent", async () => {
    const { fetch, calls } = recorder(live);
    const result = await fetchKickoffForecast({ game: outdoor, nowIso, fetch, userAgent });
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.weather.gov/points/39.9008,-75.1675",
      "https://api.weather.gov/gridpoints/PHI/50,76/forecast/hourly",
    ]);
    expect(calls.every((call) => call.headers["User-Agent"] === userAgent)).toBe(true);
    expect(result.state).toBe("applicable");
    expect(result.item).toMatchObject({
      sourceId: "nws-forecast",
      url: "https://api.weather.gov/gridpoints/PHI/50,76/forecast/hourly",
      retrievedAt: nowIso,
      publishedAt: "2026-10-25T20:00:00.000Z",
    });
  });

  it("makes no request when the roof is closed", async () => {
    const { fetch, calls } = recorder(live);
    const result = await fetchKickoffForecast({ game: dome, nowIso, fetch, userAgent });
    expect(calls).toEqual([]);
    expect(result.state).toBe("irrelevant");
  });

  it("reports a gap for a venue outside NWS coverage without a request", async () => {
    const london: ScheduledGame = {
      ...outdoor,
      venue: { name: "Tottenham Hotspur Stadium", stadiumId: "LON02", roof: "outdoors" },
    };
    const { fetch, calls } = recorder(live);
    const result = await fetchKickoffForecast({ game: london, nowIso, fetch, userAgent });
    expect(calls).toEqual([]);
    expect(result.state).toBe("missing");
    expect(result.reason).toMatch(/LON02/);
  });

  it("reports a failed points lookup as a gap instead of throwing", async () => {
    const { fetch } = recorder(() => ({ ok: false, body: "" }));
    const result = await fetchKickoffForecast({ game: outdoor, nowIso, fetch, userAgent });
    expect(result.state).toBe("missing");
    expect(result.reason).toMatch(/NWS/);
  });

  it("records null and invalid forecast JSON as a gap instead of throwing", async () => {
    for (const body of ["null", "{", "[]"]) {
      const { fetch } = recorder((url) =>
        url.includes("/points/") ? live(url) : { ok: true, body },
      );
      const result = await fetchKickoffForecast({ game: outdoor, nowIso, fetch, userAgent });
      expect(result.state, body).toBe("missing");
      expect(result.item, body).toBeNull();
      expect(result.reason, body).toMatch(/payload|not JSON/i);
    }
  });

  it("reports a forecast that never answers as a timeout gap", async () => {
    const { fetch } = recorder((url) => (url.includes("/points/") ? live(url) : "hang"));
    const result = await fetchKickoffForecast({
      game: outdoor,
      nowIso,
      fetch,
      userAgent,
      timeoutMs: 20,
    });
    expect(result.state).toBe("missing");
    expect(result.reason).toMatch(/timeout/);
  });
});
