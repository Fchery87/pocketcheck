import { existsSync, readFileSync, statSync } from "node:fs";
import { readDownloadRecord } from "../sources/download-record.ts";
import { scheduleGamesFromCsv } from "../sources/nflverse.ts";
import type { ScheduledGame } from "../sources/contracts.ts";
import { gameHasStarted } from "./games.ts";

export type ScheduleRead =
  | { ok: true; path: string; games: ScheduledGame[]; retrievedAt: string }
  | { ok: false; path: string; reason: string };

type CachedSchedule = { key: string; read: ScheduleRead };
const scheduleCache = new Map<string, CachedSchedule>();

/** The file's mtime and size, or null when it does not exist or cannot be stat-ed. */
function scheduleKey(path: string): string | null {
  try {
    return existsSync(path) ? `${statSync(path).mtimeMs}:${statSync(path).size}` : null;
  } catch {
    return null;
  }
}

/**
 * The parsed schedule, reused until the file's mtime or size changes. Every page load and form
 * action reads the schedule, so reparsing a multi-megabyte CSV per request is the app's largest
 * avoidable cost.
 */
export function readSchedule(path: string): ScheduleRead {
  const key = scheduleKey(path);
  const cached = key === null ? undefined : scheduleCache.get(path);
  if (cached && cached.key === key) return cached.read;
  const read = parseSchedule(path);
  if (read.ok && key !== null) scheduleCache.set(path, { key, read });
  else scheduleCache.delete(path);
  return read;
}

function parseSchedule(path: string): ScheduleRead {
  if (!existsSync(path)) {
    return { ok: false, path, reason: `No schedule file at ${path}. Run npm run data:schedule.` };
  }
  try {
    const { retrievedAt } = readDownloadRecord(path);
    return {
      ok: true,
      path,
      retrievedAt,
      games: scheduleGamesFromCsv(readFileSync(path, "utf8"), { retrievedAt }),
    };
  } catch (error) {
    return {
      ok: false,
      path,
      reason: error instanceof Error ? error.message : "The schedule file could not be read.",
    };
  }
}

export function upcomingGames(games: ScheduledGame[], nowIso: string): ScheduledGame[] {
  return games
    .filter((game) => !gameHasStarted(game, nowIso))
    .sort(
      (left, right) =>
        Date.parse(left.kickoff) - Date.parse(right.kickoff) || left.id.localeCompare(right.id),
    );
}
