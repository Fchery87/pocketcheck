import type { StarterAssumption } from "./forecast.ts";
import type { CompletedGame } from "./games.ts";
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
  cutoff: string;
  /** The most frequent recent starter, the latest on a tie. */
  usualStarter: string | null;
  depthChart: readonly DepthChartEntry[];
  injuries: readonly InjuryDesignation[];
}): StarterDecision {
  const cutoff = Date.parse(input.cutoff);
  const before = input.depthChart.filter(
    (entry) =>
      entry.team === input.team &&
      entry.season === input.season &&
      entry.position === "QB" &&
      entry.updatedAt !== null &&
      Date.parse(entry.updatedAt) < cutoff,
  );
  // Depth charts are daily snapshots. Only the latest one before the cutoff speaks.
  const latest = Math.max(...before.map((entry) => Date.parse(entry.updatedAt!)));
  const chart = before
    .filter((entry) => Date.parse(entry.updatedAt!) === latest)
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

const RECENT_WINDOW = 8;

/**
 * The quarterback with the most of the team's last games started before the cutoff, the latest on
 * a tie, and the kickoff of the latest game that quarterback started. Null with no recorded start.
 */
export function recentStarter(
  history: readonly Pick<CompletedGame, "kickoff" | "home" | "away" | "homeQb" | "awayQb">[],
  team: string,
  cutoff: string,
): { playerId: string; at: string } | null {
  const starts = history
    .filter((game) => Date.parse(game.kickoff) < Date.parse(cutoff))
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff))
    .flatMap((game) => {
      const playerId = game.home === team ? game.homeQb : game.away === team ? game.awayQb : null;
      return playerId ? [{ playerId, at: game.kickoff }] : [];
    })
    .slice(-RECENT_WINDOW);
  let best: { playerId: string; at: string } | null = null;
  let bestCount = 0;
  for (const start of starts) {
    const count = starts.filter((other) => other.playerId === start.playerId).length;
    if (count >= bestCount) {
      best = { playerId: start.playerId, at: start.at };
      bestCount = count;
    }
  }
  return (
    best && {
      playerId: best.playerId,
      at: [...starts].reverse().find((s) => s.playerId === best!.playerId)!.at,
    }
  );
}

/** The frozen form of a decision. A starter assumed from history is stamped with its latest start. */
export function starterAssumption(
  decision: StarterDecision,
  historyAt: string | null,
): StarterAssumption {
  if (decision.state === "unknown" || decision.playerId === null) {
    return {
      state: "unknown",
      identity: null,
      evidenceAt: null,
      source: null,
      reason: decision.reason,
    };
  }
  return {
    state: decision.state,
    identity: decision.playerId,
    evidenceAt: decision.sourceAt ?? historyAt,
    source: decision.source,
  };
}
