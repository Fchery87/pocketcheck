import { existsSync, readFileSync } from "node:fs";
import { readDownloadRecord } from "../sources/download-record.ts";
import { scheduleGamesFromCsv } from "../sources/nflverse.ts";
import type { ScheduledGame } from "../sources/contracts.ts";
import { gameHasStarted } from "./games.ts";

export type ScheduleRead =
  | { ok: true; path: string; games: ScheduledGame[]; retrievedAt: string }
  | { ok: false; path: string; reason: string };

export function readSchedule(path: string): ScheduleRead {
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
