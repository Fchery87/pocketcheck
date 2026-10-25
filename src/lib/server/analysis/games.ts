import { readFileSync } from "node:fs";
import { scheduleGamesFromCsv } from "../sources/nflverse.ts";
import type { ScheduledGame } from "../sources/contracts.ts";

export function loadFixtureGames(csvPath: string, retrievedAt: string): ScheduledGame[] {
  return scheduleGamesFromCsv(readFileSync(csvPath, "utf8"), { retrievedAt });
}

export function gameHasStarted(game: ScheduledGame, nowIso: string): boolean {
  if (game.finalScore) return true;
  const kickoff = Date.parse(game.kickoff);
  const now = Date.parse(nowIso);
  return Number.isFinite(kickoff) && Number.isFinite(now) && kickoff <= now;
}
