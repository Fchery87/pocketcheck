import type { EvidenceItem, RoofState } from "./contracts.ts";
import { evidenceItem } from "./item.ts";

type ForecastPeriod = {
  startTime?: string;
  endTime?: string;
  temperature?: number;
  temperatureUnit?: string;
  windSpeed?: string;
  windDirection?: string;
  shortForecast?: string;
  probabilityOfPrecipitation?: { value?: number | null };
};

type ForecastPayload = {
  properties?: {
    /** When the forecast was issued. generatedAt is only when this response was rendered. */
    updateTime?: string;
    periods?: ForecastPeriod[];
  };
};

export type WeatherEvidence =
  | { state: "applicable"; item: EvidenceItem; reason: null }
  | { state: "irrelevant" | "missing"; item: null; reason: string };

function closedRoof(roof: RoofState): boolean {
  return roof === "dome" || roof === "closed";
}

export function kickoffForecastEvidence(input: {
  roof: RoofState;
  kickoff: string;
  payload: ForecastPayload | null;
  retrievedAt: string;
  sourceUrl: string | null;
}): WeatherEvidence {
  if (closedRoof(input.roof)) {
    return {
      state: "irrelevant",
      item: null,
      reason: `Roof is ${input.roof}. An outdoor forecast is not applied to the field.`,
    };
  }
  if (input.roof === "unknown") {
    return {
      state: "missing",
      item: null,
      reason: "Roof state is unknown, so an outdoor forecast is not applied.",
    };
  }
  const periods = input.payload?.properties?.periods ?? [];
  const kickoff = Date.parse(input.kickoff);
  const period = periods.find((entry) => {
    const start = Date.parse(entry.startTime ?? "");
    const end = Date.parse(entry.endTime ?? "");
    return Number.isFinite(start) && Number.isFinite(end) && kickoff >= start && kickoff < end;
  });
  if (!period) {
    return {
      state: "missing",
      item: null,
      reason: "No forecast coverage for the kickoff period.",
    };
  }
  const issued = Date.parse(input.payload?.properties?.updateTime ?? "");
  const publishedAt = Number.isFinite(issued) ? new Date(issued).toISOString() : "unknown";
  const wind = [period.windDirection, period.windSpeed].filter(Boolean).join(" ");
  return {
    state: "applicable",
    reason: null,
    item: evidenceItem({
      sourceId: "nws-forecast",
      url: input.sourceUrl,
      retrievedAt: input.retrievedAt,
      publishedAt,
      origin: "automatic",
      factKey: "weather:kickoff",
      facts: {
        temperatureF: period.temperatureUnit === "F" ? (period.temperature ?? null) : null,
        wind,
        shortForecast: period.shortForecast ?? "",
        precipitationChancePercent: period.probabilityOfPrecipitation?.value ?? null,
        periodStart: new Date(period.startTime ?? "").toISOString(),
        periodEnd: new Date(period.endTime ?? "").toISOString(),
      },
    }),
  };
}
