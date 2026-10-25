import type { ScheduledGame } from "./contracts.ts";
import { fetchBounded, type FetchLike } from "./fetch.ts";
import { stadiumPoint } from "./stadiums.ts";
import { kickoffForecastEvidence, type WeatherEvidence } from "./weather.ts";

const NWS = "https://api.weather.gov";

/**
 * Forecast for kickoff at the game's venue: resolve the stadium point, then read its hourly
 * forecast. Every failure becomes a visible gap; nothing here throws.
 */
export async function fetchKickoffForecast(input: {
  game: ScheduledGame;
  nowIso: string;
  fetch: FetchLike;
  /** NWS asks callers to identify themselves with contact details. */
  userAgent: string;
  timeoutMs?: number;
}): Promise<WeatherEvidence> {
  const { game } = input;
  const roofOnly = kickoffForecastEvidence({
    roof: game.venue.roof,
    kickoff: game.kickoff,
    payload: null,
    retrievedAt: input.nowIso,
    sourceUrl: null,
  });
  // A closed or unknown roof is decided without a forecast.
  if (roofOnly.state === "irrelevant" || game.venue.roof === "unknown") return roofOnly;

  const point = stadiumPoint(game.venue.stadiumId);
  if (!point) {
    return {
      state: "missing",
      item: null,
      reason: `No NWS forecast for ${game.venue.name} (${game.venue.stadiumId}): NWS covers U.S. venues only. Add a forecast as manual evidence.`,
    };
  }

  const request = {
    timeoutMs: input.timeoutMs ?? 10_000,
    schema: "json" as const,
    fetch: input.fetch,
    headers: { "User-Agent": input.userAgent, Accept: "application/geo+json" },
  };
  const pointsUrl = `${NWS}/points/${point.latitude},${point.longitude}`;
  const points = await fetchBounded(pointsUrl, request);
  if (!points.ok) {
    return { state: "missing", item: null, reason: `NWS point lookup failed: ${points.failure}` };
  }
  const hourlyUrl = (JSON.parse(points.body) as { properties?: { forecastHourly?: unknown } })
    .properties?.forecastHourly;
  if (typeof hourlyUrl !== "string" || !hourlyUrl.startsWith(`${NWS}/`)) {
    return {
      state: "missing",
      item: null,
      reason: "NWS point lookup returned no hourly forecast link.",
    };
  }
  const hourly = await fetchBounded(hourlyUrl, request);
  if (!hourly.ok) {
    return { state: "missing", item: null, reason: `NWS forecast failed: ${hourly.failure}` };
  }
  return kickoffForecastEvidence({
    roof: game.venue.roof,
    kickoff: game.kickoff,
    payload: JSON.parse(hourly.body),
    retrievedAt: input.nowIso,
    sourceUrl: hourlyUrl,
  });
}
