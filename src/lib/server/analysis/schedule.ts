import { existsSync, readFileSync, statSync } from "node:fs";
import { scheduleGamesFromCsv } from "../sources/nflverse.ts";
import type { ScheduledGame } from "../sources/contracts.ts";
import { gameHasStarted } from "./games.ts";

export type ScheduleRead =
  | { ok: true; path: string; games: ScheduledGame[]; retrievedAt: string }
  | { ok: false; path: string; reason: string };

/** Written beside the CSV by `npm run data:schedule`. */
type DownloadRecord = { retrievedAt?: string };

function retrievedAtOf(path: string): string {
  try {
    const record = JSON.parse(readFileSync(`${path}.json`, "utf8")) as DownloadRecord;
    if (record.retrievedAt && Number.isFinite(Date.parse(record.retrievedAt))) {
      return new Date(record.retrievedAt).toISOString();
    }
  } catch {
    // No download record. Fall back to when the file was last written.
  }
  return statSync(path).mtime.toISOString();
}

export function readSchedule(path: string): ScheduleRead {
  if (!existsSync(path)) {
    return { ok: false, path, reason: `No schedule file at ${path}. Run npm run data:schedule.` };
  }
  try {
    const retrievedAt = retrievedAtOf(path);
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
