import { existsSync, readFileSync } from "node:fs";
import type { EvidenceItem, ScheduledGame } from "../sources/contracts.ts";
import { readDownloadRecord } from "../sources/download-record.ts";
import { injuryEvidenceFromCsv } from "../sources/injuries.ts";
import type { WeatherEvidence } from "../sources/weather.ts";
import { INJURY_STALE_HOURS } from "../sources/downloads.ts";

/**
 * `gaps` is everything the report must show. `materialGaps` is the subset that blocks a
 * recommendation: evidence that should exist for this game and does not. Caveats, such as an
 * unknown publication time or a closed roof, are gaps but not material.
 */
export type MaterialGapKind = "injury-report" | "weather";

/** Evidence that should exist for this game and does not. It blocks a recommendation. */
export type MaterialGap = { kind: MaterialGapKind; text: string; team?: string };

export type CollectedEvidence = {
  items: EvidenceItem[];
  gaps: string[];
  materialGaps: MaterialGap[];
};

export type EvidenceCollector = (game: ScheduledGame, nowIso: string) => Promise<CollectedEvidence>;

/** No automatic sources, for tests and the walkthrough. Both sources count as missing. */
export const noSources: EvidenceCollector = async () => {
  return {
    items: [],
    gaps: ["Injury report was not collected.", "Weather was not collected."],
    materialGaps: [
      { kind: "injury-report", text: "Injury report was not collected." },
      { kind: "weather", text: "Weather was not collected." },
    ],
  };
};

const STALE_AFTER_MS = INJURY_STALE_HOURS * 60 * 60 * 1000;
const injuryUrl = (season: number) =>
  `https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_${season}.csv`;

function injuryEvidence(path: string, game: ScheduledGame, nowIso: string): CollectedEvidence {
  if (!existsSync(path)) {
    const gap = `No injury file at ${path}. Run npm run data:injuries.`;
    return { items: [], gaps: [gap], materialGaps: [{ kind: "injury-report", text: gap }] };
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
  const stale = Date.parse(nowIso) - Date.parse(record.retrievedAt) > STALE_AFTER_MS;
  if (stale) {
    gaps.push(
      `Injury file was retrieved ${record.retrievedAt}. Retrieval time does not establish publication time. Re-run npm run data:injuries for the latest report.`,
    );
  }
  const materialGaps: MaterialGap[] = [];
  for (const [team, coverage] of Object.entries(read.teams)) {
    if (coverage === "unknown") {
      materialGaps.push({
        kind: "injury-report",
        team,
        text: `${team} week ${game.week} injury coverage is not established. Absence of player rows is not a clean report.`,
      });
    } else if (stale) {
      materialGaps.push({
        kind: "injury-report",
        team,
        text: `${team} week ${game.week} injury coverage was retrieved ${record.retrievedAt}, older than 24 hours. Retrieval time does not establish publication time.`,
      });
    }
  }
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
        ...(weather.state === "missing"
          ? [{ kind: "weather" as const, text: weather.reason }]
          : []),
      ],
    };
  };
}
