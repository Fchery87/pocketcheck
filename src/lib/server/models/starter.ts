import type { DepthChartEntry } from "../sources/roster.ts";
import { TIMESTAMPED_DEPTH_CHART_SEASON } from "../sources/roster.ts";

/** Who starts, and how sure the forecasting model is. */
export type StarterDecision = {
  state: "known" | "assumed" | "unknown";
  /** The player id, or null when unknown. */
  playerId: string | null;
  source: "depth chart" | "injury report" | "recent starts" | null;
  /** When the deciding source was published. Null when the starter is only assumed from history. */
  sourceAt: string | null;
  /** Why the starter is unknown, when it is. */
  reason: string | null;
};

export type InjuryDesignation = {
  team: string;
  playerId: string;
  /** Out or doubtful moves the starter. Questionable does not. */
  status: string;
  publishedAt: string;
};

const OUT = new Set(["out", "doubtful"]);

/**
 * Decides one team's starter from sources published strictly before the cutoff.
 * An out or doubtful usual starter makes the depth-chart backup the assumed starter. A
 * timestamped depth chart makes the starter known. Two sources naming different starters make
 * the starter unknown. Seasons before 2025 have no timestamp, so they stay assumed.
 */
export function starterDecision(input: {
  team: string;
  season: number;
  week: number;
  cutoff: string;
  /** The most frequent recent starter, the latest on a tie. */
  usualStarter: string | null;
  depthChart: readonly DepthChartEntry[];
  injuries: readonly InjuryDesignation[];
}): StarterDecision {
  const cutoff = Date.parse(input.cutoff);
  const chart = input.depthChart
    .filter(
      (entry) =>
        entry.team === input.team &&
        entry.season === input.season &&
        entry.week === input.week &&
        entry.position === "QB" &&
        entry.updatedAt !== null &&
        Date.parse(entry.updatedAt) < cutoff,
    )
    .sort((a, b) => a.depth - b.depth);
  const listed = chart.find((entry) => entry.depth === 1) ?? null;
  const backup = chart.find((entry) => entry.depth === 2) ?? null;
  const injured = input.injuries.filter(
    (entry) =>
      entry.team === input.team &&
      OUT.has(entry.status.toLowerCase()) &&
      Date.parse(entry.publishedAt) < cutoff,
  );
  const usualOut =
    input.usualStarter !== null && injured.some((entry) => entry.playerId === input.usualStarter);

  if (
    listed &&
    usualOut &&
    listed.playerId !== backup?.playerId &&
    input.usualStarter !== listed.playerId
  ) {
    return {
      state: "unknown",
      playerId: null,
      source: null,
      sourceAt: null,
      reason: "The depth chart and the injury report name different starters.",
    };
  }
  if (usualOut && backup && input.season >= TIMESTAMPED_DEPTH_CHART_SEASON) {
    return {
      state: "assumed",
      playerId: backup.playerId,
      source: "injury report",
      sourceAt: injured.find((entry) => entry.playerId === input.usualStarter)?.publishedAt ?? null,
      reason: null,
    };
  }
  if (listed && input.season >= TIMESTAMPED_DEPTH_CHART_SEASON) {
    return {
      state: "known",
      playerId: listed.playerId,
      source: "depth chart",
      sourceAt: listed.updatedAt,
      reason: null,
    };
  }
  if (input.usualStarter) {
    return {
      state: "assumed",
      playerId: input.usualStarter,
      source: "recent starts",
      sourceAt: null,
      reason: null,
    };
  }
  return {
    state: "unknown",
    playerId: null,
    source: null,
    sourceAt: null,
    reason: "No starter is known.",
  };
}
