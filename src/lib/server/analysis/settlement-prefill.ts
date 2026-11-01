import { createHash } from "node:crypto";
import { validFinalScores } from "#lib/domain/settlement.ts";
import type { ScheduleRead } from "./schedule.ts";

export type SettlementPrefill = {
  homeScore: number;
  awayScore: number;
  source: string;
  retrievedAt: string;
  identity: string;
};

export function settlementPrefill(input: {
  game: { id: string; home: string; away: string; kickoff: string };
  schedule: ScheduleRead;
  now: string;
  source: string;
}): SettlementPrefill | null {
  if (!input.schedule.ok) return null;
  const game = input.schedule.games.find((entry) => entry.id === input.game.id);
  const score = game?.finalScore;
  const kickoff = Date.parse(input.game.kickoff);
  const retrieved = Date.parse(input.schedule.retrievedAt);
  const now = Date.parse(input.now);
  if (
    !game ||
    !score ||
    game.home !== input.game.home ||
    game.away !== input.game.away ||
    !validFinalScores(score.home, score.away) ||
    !Number.isFinite(kickoff) ||
    !Number.isFinite(retrieved) ||
    !Number.isFinite(now) ||
    !(kickoff < retrieved && retrieved <= now)
  )
    return null;
  const candidate = {
    gameId: game.id,
    homeScore: score.home,
    awayScore: score.away,
    source: input.source,
    retrievedAt: input.schedule.retrievedAt,
  };
  const { gameId: _gameId, ...values } = candidate;
  return {
    ...values,
    identity: createHash("sha256").update(JSON.stringify(candidate)).digest("hex"),
  };
}
