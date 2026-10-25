import { existsSync, readFileSync } from "node:fs";
import type { EvidenceItem, ScheduledGame } from "../sources/contracts.ts";
import { readDownloadRecord } from "../sources/download-record.ts";
import { injuryEvidenceFromCsv } from "../sources/injuries.ts";
import type { WeatherEvidence } from "../sources/weather.ts";

/**
 * `gaps` is everything the report must show. `materialGaps` is the subset that blocks a
 * recommendation: evidence that should exist for this game and does not. Caveats, such as an
 * unknown publication time or a closed roof, are gaps but not material.
 */
export type CollectedEvidence = { items: EvidenceItem[]; gaps: string[]; materialGaps: string[] };

export type EvidenceCollector = (game: ScheduledGame, nowIso: string) => Promise<CollectedEvidence>;

/** No automatic sources, for tests and the walkthrough. Both sources count as missing. */
export const noSources: EvidenceCollector = async () => {
  const missing = ["Injury report was not collected.", "Weather was not collected."];
  return { items: [], gaps: missing, materialGaps: missing };
};

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const injuryUrl = (season: number) =>
  `https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_${season}.csv`;

function injuryEvidence(path: string, game: ScheduledGame, nowIso: string): CollectedEvidence {
  if (!existsSync(path)) {
    const gap = `No injury file at ${path}. Run npm run data:injuries.`;
    return { items: [], gaps: [gap], materialGaps: [gap] };
  }
  const record = readDownloadRecord(path);
  const read = injuryEvidenceFromCsv(readFileSync(path, "utf8"), {
    season: game.season,
    week: game.week,
    teams: [game.away, game.home],
    retrievedAt: record.retrievedAt,
    sourceUrl: record.source ?? injuryUrl(game.season),
  });
  const gaps = [...read.gaps];
  if (Date.parse(nowIso) - Date.parse(record.retrievedAt) > STALE_AFTER_MS) {
    gaps.push(
      `Injury file was retrieved ${record.retrievedAt}. Re-run npm run data:injuries for the latest report.`,
    );
  }
  // With no rows for this week, the leading gap says so; that one is material.
  const materialGaps = read.items.length === 0 ? read.gaps.slice(0, 1) : [];
  return { items: read.items, gaps, materialGaps };
}

export function createSourceCollector(input: {
  injuryPath: (season: number) => string;
  weather: (game: ScheduledGame, nowIso: string) => Promise<WeatherEvidence>;
}): EvidenceCollector {
  return async (game, nowIso) => {
    const injuries = injuryEvidence(input.injuryPath(game.season), game, nowIso);
    const weather = await input.weather(game, nowIso);
    return {
      items: [...injuries.items, ...(weather.item ? [weather.item] : [])],
      gaps: [...injuries.gaps, ...(weather.reason ? [weather.reason] : [])],
      materialGaps: [
        ...injuries.materialGaps,
        ...(weather.state === "missing" ? [weather.reason] : []),
      ],
    };
  };
}
