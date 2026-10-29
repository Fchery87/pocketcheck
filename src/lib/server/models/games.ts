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
   * Raw efficiency from play-by-play, present only when that game's plays were
   * available. The feature builder adjusts it for the opponent. Absent numbers stay unknown and
   * contribute nothing.
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
    /** Starting quarterback's completion percentage over expected, in percentage points. */
    homeQbCpoe?: number | null;
    awayQbCpoe?: number | null;
    /** Dropbacks the starter had, so a relief appearance counts for less. */
    homeQbDropbacks?: number;
    awayQbDropbacks?: number;
    /** Splits and rates beyond the EPA per play. Absent in records built before they existed. */
    home?: SideRates;
    away?: SideRates;
  };
  /** Schedule and stadium facts known before kickoff. */
  venue?: GameVenue;
};

/** One team's offense and defense in one game, defense as what it prevented (higher is better). */
export type SideRates = {
  offense: UnitRates;
  defense: UnitRates;
  /** Interceptions thrown and fumbles lost by this team's offense. */
  giveaways: number;
  /** Fumbles this team's defense recovered, the part of takeaways that is mostly luck. */
  fumblesRecovered: number;
};

export type UnitRates = {
  passEpa: number | null;
  rushEpa: number | null;
  success: number | null;
  earlyDownEpa: number | null;
  explosive: number | null;
};

export type GameVenue = {
  stadiumId: string;
  roof: string;
  surface: string;
  /** The stadium each club calls home that season, where its trip starts. */
  homeBaseId?: string;
  awayBaseId?: string;
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
