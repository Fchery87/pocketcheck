/**
 * Injury impact per team. A player listed out or doubtful before the cutoff counts as their recent
 * snap share times a position value. The quarterback is handled by the starter state, so a
 * quarterback designation adds nothing here. A player with no snap share is unknown, not healthy.
 * A designation with no publication time is ignored, because it cannot be shown to predate the cutoff.
 */

export type InjuryDesignation = {
  team: string;
  playerId: string;
  position: string;
  status: "out" | "doubtful" | "questionable" | "probable";
  /** Null when the source did not say when it was published. */
  publishedAt: string | null;
  /** Recent offensive or defensive snap share, from a week that already finished. Null when unknown. */
  snapShare: number | null;
};

export type TeamInjuryImpact = {
  offense: number;
  defense: number;
  /** Offensive line starters listed out or doubtful. */
  line: number;
  /** Players who could not be weighted because their snap share is unknown. */
  unknown: number;
};

/** Versioned position values. A quarterback is zero because the starter state handles that position. */
export const POSITION_VALUES = {
  version: "position-values-v1",
  values: {
    QB: 0,
    T: 0.6,
    G: 0.5,
    C: 0.5,
    OL: 0.5,
    WR: 0.4,
    TE: 0.4,
    RB: 0.4,
    DL: 0.4,
    LB: 0.3,
    DB: 0.3,
  },
} as const;

const LINE = new Set(["T", "G", "C", "OL"]);
const DEFENSE = new Set(["DL", "LB", "DB", "DE", "DT", "CB", "S"]);

export function injuryImpact(
  designations: readonly InjuryDesignation[],
  cutoff: string,
): Record<string, TeamInjuryImpact> {
  const cutoffMs = Date.parse(cutoff);
  const byTeam: Record<string, TeamInjuryImpact> = {};
  for (const designation of designations) {
    if (designation.status !== "out" && designation.status !== "doubtful") continue;
    const published = designation.publishedAt ? Date.parse(designation.publishedAt) : Number.NaN;
    if (!Number.isFinite(published) || published > cutoffMs) continue;
    const team = (byTeam[designation.team] ??= { offense: 0, defense: 0, line: 0, unknown: 0 });
    const position = designation.position.toUpperCase();
    if (position === "QB") continue;
    if (designation.snapShare === null || !Number.isFinite(designation.snapShare)) {
      team.unknown += 1;
      continue;
    }
    const value = POSITION_VALUES.values[position as keyof typeof POSITION_VALUES.values] ?? 0.2;
    const weighted = designation.snapShare * value;
    if (DEFENSE.has(position)) team.defense += weighted;
    else team.offense += weighted;
    if (LINE.has(position)) team.line += 1;
  }
  return byTeam;
}
