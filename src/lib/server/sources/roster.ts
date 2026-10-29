import { existsSync, readFileSync } from "node:fs";
import { parseCsv } from "./nflverse.ts";

/**
 * Weekly roster, depth chart, and snap count rows. Depth charts are used live only where
 * timestamped, which nflverse provides from 2025. Earlier seasons fall back to the assumed
 * starter rule. A bad file is a gap and leaves the other files readable.
 */
export const ROSTER_LICENSE = {
  name: "CC BY 4.0",
  attribution: "nflverse",
  url: "https://github.com/nflverse/nflverse-data",
} as const;

/** The first season whose depth charts carry a timestamp, so they can be used before kickoff. */
export const TIMESTAMPED_DEPTH_CHART_SEASON = 2025;

export type DepthChartEntry = {
  season: number;
  week: number;
  team: string;
  position: string;
  /** 1 is the starter. */
  depth: number;
  playerId: string;
  player: string;
  /** Null when the file has no timestamp, which is every season before 2025. */
  updatedAt: string | null;
};

export type RosterEntry = {
  season: number;
  week: number;
  team: string;
  playerId: string;
  player: string;
  position: string;
};

export type SnapCountEntry = {
  season: number;
  week: number;
  team: string;
  playerId: string;
  player: string;
  position: string;
  offenseSnaps: number;
  defenseSnaps: number;
  offensePercent: number | null;
};

export type RosterRead<T> = { rows: T[]; gaps: string[] };

export function depthChartFromCsv(csv: string): RosterRead<DepthChartEntry> {
  return read(csv, "Depth chart", (row) => {
    const depth = Number(row.depth_team ?? row.pos_rank);
    if (!row.club_code || !row.gsis_id || !Number.isFinite(depth)) return null;
    return {
      season: Number(row.season),
      week: Number(row.week),
      team: row.club_code,
      position: row.position ?? "",
      depth,
      playerId: row.gsis_id,
      player: row.full_name ?? "",
      updatedAt: row.dt ?? row.updated_at ?? null,
    };
  });
}

export function rosterFromCsv(csv: string): RosterRead<RosterEntry> {
  return read(csv, "Roster", (row) => {
    if (!row.team || !row.gsis_id) return null;
    return {
      season: Number(row.season),
      week: Number(row.week),
      team: row.team,
      playerId: row.gsis_id,
      player: row.full_name ?? "",
      position: row.position ?? "",
    };
  });
}

export function snapCountsFromCsv(csv: string): RosterRead<SnapCountEntry> {
  return read(csv, "Snap counts", (row) => {
    if (!row.team || (!row.pfr_player_id && !row.player)) return null;
    return {
      season: Number(row.season),
      week: Number(row.week),
      team: row.team,
      playerId: row.pfr_player_id || row.player || "",
      player: row.player ?? "",
      position: row.position ?? "",
      offenseSnaps: Number(row.offense_snaps) || 0,
      defenseSnaps: Number(row.defense_snaps) || 0,
      offensePercent: row.offense_pct === "" ? null : Number(row.offense_pct),
    };
  });
}

/** Reads one file per season. A missing season is a gap for that season only. */
export function readSeasonFiles<T>(
  files: readonly { season: number; path: string }[],
  parse: (csv: string) => RosterRead<T>,
  label: string,
): RosterRead<T> {
  const rows: T[] = [];
  const gaps: string[] = [];
  for (const file of files) {
    if (!existsSync(file.path)) {
      gaps.push(`${label} for ${file.season} is missing.`);
      continue;
    }
    let text = "";
    try {
      text = readFileSync(file.path, "utf8");
    } catch {
      gaps.push(`${label} for ${file.season} could not be read.`);
      continue;
    }
    const read = parse(text);
    if (read.gaps.length > 0) {
      gaps.push(...read.gaps.map((gap) => `${file.season}: ${gap}`));
      continue;
    }
    rows.push(...read.rows);
  }
  return { rows, gaps };
}

function read<T>(
  csv: string,
  label: string,
  rowOf: (row: Record<string, string>) => T | null,
): RosterRead<T> {
  if (csv.trim() === "") return { rows: [], gaps: [`${label} file is empty.`] };
  const parsed = parseCsv(csv);
  if (parsed.length === 0) return { rows: [], gaps: [`${label} file has no rows.`] };
  const rows = parsed.flatMap((row) => {
    const value = rowOf(row);
    return value === null ? [] : [value];
  });
  return {
    rows,
    gaps: rows.length === 0 ? [`${label} file has no usable rows.`] : [],
  };
}
