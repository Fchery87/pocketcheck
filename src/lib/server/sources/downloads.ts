import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { checksumOf } from "./cache.ts";
import { readDownloadRecord } from "./download-record.ts";
import { fetchBounded, type FetchLike } from "./fetch.ts";
import { PLAY_BY_PLAY_LICENSE } from "./play-by-play.ts";
import { ROSTER_LICENSE, depthChartFromCsv } from "./roster.ts";

export type SourceId = "schedule" | "injuries" | "depth-charts" | "play-by-play";

/** Injury coverage retrieved longer ago than this is a material gap for an analysis. */
export const INJURY_STALE_HOURS = 24;

const RELEASES = "https://github.com/nflverse/nflverse-data/releases/download";

type SourceDefinition = {
  label: string;
  command: string;
  url: (season: number) => string;
  timeoutMs: number;
  schema: "csv" | "nflverse-games";
  /** Why the body cannot be used, or null. */
  problem: (body: string) => string | null;
  /** Fields beyond source, retrievedAt, checksum, and rows. */
  extra: (body: string) => Record<string, unknown>;
  staleAfterHours: number | null;
  /** Play-by-play seasons are about 100 MB and stay a terminal command. */
  settings: boolean;
};

const lineRows = (body: string) => body.split(/\r?\n/).filter((line) => line.length > 0).length - 1;

function missingColumns(label: string, columns: string[]) {
  return (body: string) => {
    const header = (body.split(/\r?\n/, 1)[0] ?? "").split(",");
    return columns.every((column) => header.includes(column))
      ? null
      : `schema mismatch: the ${label} file is missing expected columns`;
  };
}

export const SOURCES: Record<SourceId, SourceDefinition> = {
  schedule: {
    label: "schedule",
    command: "npm run data:schedule",
    url: () => "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv",
    timeoutMs: 30_000,
    schema: "nflverse-games",
    problem: () => null,
    extra: () => ({}),
    staleAfterHours: null,
    settings: true,
  },
  injuries: {
    label: "injury",
    command: "npm run data:injuries",
    url: (season) => `${RELEASES}/injuries/injuries_${season}.csv`,
    timeoutMs: 30_000,
    schema: "csv",
    problem: missingColumns("injury", ["season", "week", "team", "full_name", "report_status"]),
    extra: () => ({}),
    staleAfterHours: INJURY_STALE_HOURS,
    settings: true,
  },
  "depth-charts": {
    label: "depth chart",
    command: "npm run data:depth-charts",
    url: (season) => `${RELEASES}/depth_charts/depth_charts_${season}.csv`,
    timeoutMs: 60_000,
    schema: "csv",
    problem: (body) => depthChartFromCsv(body).gaps[0] ?? null,
    extra: (body) => {
      const parsed = depthChartFromCsv(body);
      return { publicationTime: null, license: ROSTER_LICENSE, gaps: parsed.gaps };
    },
    staleAfterHours: null,
    settings: true,
  },
  "play-by-play": {
    label: "play-by-play",
    command: "npm run data:play-by-play",
    url: (season) => `${RELEASES}/pbp/play_by_play_${season}.csv`,
    timeoutMs: 120_000,
    schema: "csv",
    problem: missingColumns("play-by-play", ["game_id", "posteam", "defteam", "play_type", "epa"]),
    extra: () => ({ publicationTime: null, license: PLAY_BY_PLAY_LICENSE }),
    staleAfterHours: null,
    settings: false,
  },
};

/** The NFL season is named for the year it starts; January and February games belong to it. */
export function seasonOf(iso: string): number {
  const date = new Date(iso);
  return date.getUTCMonth() < 2 ? date.getUTCFullYear() - 1 : date.getUTCFullYear();
}

export type DownloadResult =
  | { ok: true; output: string; record: Record<string, unknown> }
  | { ok: false; failure: string };

const running = new Set<string>();

function replaceFile(path: string, body: string) {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, body, { flag: "wx" });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

/**
 * Downloads one source file and its retrieval record. Each file is replaced by a rename, so a
 * reader sees the old file or the new one, never part of one. The data file is replaced first,
 * so a reader between the two renames sees an older retrieval time, never a newer one.
 */
export async function downloadSource(
  id: SourceId,
  input: { season: number; output: string; fetch: FetchLike; now: () => string },
): Promise<DownloadResult> {
  const source = SOURCES[id];
  const unchanged = "The existing file, if any, is unchanged.";
  if (running.has(input.output)) {
    return { ok: false, failure: `A ${source.label} download is already running. ${unchanged}` };
  }
  running.add(input.output);
  try {
    const url = source.url(input.season);
    const result = await fetchBounded(url, {
      timeoutMs: source.timeoutMs,
      schema: source.schema,
      fetch: input.fetch,
    });
    const failure = result.ok ? source.problem(result.body) : result.failure;
    if (!result.ok || failure) {
      return {
        ok: false,
        failure: `The ${source.label} download failed: ${failure}. ${unchanged}`,
      };
    }
    const record = {
      source: url,
      retrievedAt: input.now(),
      checksum: checksumOf(result.body),
      rows: lineRows(result.body),
      ...source.extra(result.body),
    };
    mkdirSync(dirname(input.output), { recursive: true });
    replaceFile(input.output, result.body);
    replaceFile(`${input.output}.json`, `${JSON.stringify(record, null, 2)}\n`);
    return { ok: true, output: input.output, record };
  } finally {
    running.delete(input.output);
  }
}

export type SourceStatus =
  | { state: "missing" }
  | {
      state: "present";
      retrievedAt: string;
      /** Null when the file has no retrieval record to count from. */
      rows: number | null;
      ageHours: number;
      stale: boolean;
    };

export function sourceStatus(id: SourceId, path: string, nowIso: string): SourceStatus {
  if (!existsSync(path)) return { state: "missing" };
  const { retrievedAt } = readDownloadRecord(path);
  let rows: number | null = null;
  try {
    const record = JSON.parse(readFileSync(`${path}.json`, "utf8")) as { rows?: unknown };
    if (typeof record.rows === "number" && Number.isInteger(record.rows)) rows = record.rows;
  } catch {
    // No retrieval record, so the row count stays unknown.
  }
  const hours = (Date.parse(nowIso) - Date.parse(retrievedAt)) / 3_600_000;
  const limit = SOURCES[id].staleAfterHours;
  return {
    state: "present",
    retrievedAt,
    rows,
    ageHours: Math.max(0, Math.floor(hours)),
    stale: limit !== null && hours > limit,
  };
}
