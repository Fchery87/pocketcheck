export type CompletedGame = {
  id: string;
  /** NFL season. A January playoff game belongs to the season that started the previous fall. */
  season?: number;
  kickoff: string;
  /** Source-established final-result availability, when recorded. */
  resultAvailableAt?: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  neutral?: boolean;
  /** Starting quarterbacks' player ids, when known. */
  homeQb?: string;
  awayQb?: string;
  /**
   * Opponent-adjusted efficiency from play-by-play, present only when that game's plays were
   * available. Absent numbers stay unknown and contribute nothing.
   */
  efficiency?: {
    homeOffenseEpa: number;
    awayOffenseEpa: number;
    homeDefenseEpa: number;
    awayDefenseEpa: number;
    homeSecondsPerPlay: number | null;
    awaySecondsPerPlay: number | null;
    homePassOverExpected: number | null;
    awayPassOverExpected: number | null;
    homeQbEpa: number | null;
    awayQbEpa: number | null;
  };
};

export type Market = "moneyline" | "spread" | "total";

export type PriceSide = {
  american: number;
};

export type HistoricalPrices = {
  moneyline?: { home: PriceSide; away: PriceSide };
  spread?: { line: number; home: PriceSide; away: PriceSide };
  total?: { line: number; over: PriceSide; under: PriceSide };
};

export type PricedGame = CompletedGame & {
  prices?: HistoricalPrices | null;
};

export function kickoffMs(game: { kickoff: string }): number {
  const ms = Date.parse(game.kickoff);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid kickoff: ${game.kickoff}`);
  }
  return ms;
}

export const CHRONOLOGY = {
  version: "result-availability-v1",
  fallback: "kickoff-plus-24-hours",
  cutoff: "strictly-before",
  kickoffGroups: "intact",
} as const;

/** The fallback is a conservative policy estimate, never a source publication timestamp. */
export function resultAvailableMs(game: { kickoff: string; resultAvailableAt?: string }): number {
  const kickoff = kickoffMs(game);
  if (game.resultAvailableAt === undefined) return kickoff + 86_400_000;
  const available = Date.parse(game.resultAvailableAt);
  if (!Number.isFinite(available) || available <= kickoff) {
    throw new Error(`Invalid result availability: ${game.resultAvailableAt}`);
  }
  return available;
}

export function marginHome(game: CompletedGame): number {
  return game.homeScore - game.awayScore;
}

export function totalPoints(game: CompletedGame): number {
  return game.homeScore + game.awayScore;
}
