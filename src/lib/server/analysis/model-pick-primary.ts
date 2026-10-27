import { PROSPECTIVE_PROTOCOL } from "../models/release.ts";

/**
 * The frozen role of a model pick for its game and market. It is chosen once, when the pick's
 * board reaches a terminal status, from completion order and the pregame cutoff. A final score is
 * never an input.
 */
export type ModelPickRole =
  | { role: "primary"; reason: string; protocolId: string }
  | { role: "refresh"; reason: string; primaryPickId: string | null }
  | { role: "ineligible"; reason: string }
  | { role: "unclassified"; reason: string };

export const PRIMARY_PICK_REASON = "Earliest completed model pick before kickoff";
export const REFRESH_PICK_REASON =
  "Later completed model pick for this game and market. The primary model pick is unchanged.";
export const REFRESH_BOARD_REASON = "A refreshed board is never the primary model pick.";
export const NOT_COMPLETED_PICK_REASON =
  "The board did not complete, so this model pick is not a pregame observation.";
export const AFTER_KICKOFF_PICK_REASON =
  "Decision cutoff is not before kickoff, so this model pick is not an eligible pregame observation.";
export const UNCLASSIFIED_PICK_REASON =
  "Not classified: completion was not recorded before outcomes were known.";

export function unclassifiedPickRole(): ModelPickRole {
  return { role: "unclassified", reason: UNCLASSIFIED_PICK_REASON };
}

/**
 * The primary model pick for a game and market is the earliest completed one whose cutoff is
 * strictly before kickoff. Boards finish one at a time per game, so "earliest" is whichever
 * finished first; a tie still leaves a single primary. A refresh is never primary.
 */
export function chooseModelPickRole(input: {
  status: "completed" | "failed" | "interrupted";
  cutoffAt: string;
  kickoffAt: string;
  isRefresh: boolean;
  /** The already frozen primary for this game and market, if any. */
  primaryPickId: string | null;
}): ModelPickRole {
  if (input.status !== "completed") {
    return { role: "ineligible", reason: NOT_COMPLETED_PICK_REASON };
  }
  if (!(Date.parse(input.cutoffAt) < Date.parse(input.kickoffAt))) {
    return { role: "ineligible", reason: AFTER_KICKOFF_PICK_REASON };
  }
  if (input.isRefresh) {
    return {
      role: "refresh",
      reason: REFRESH_BOARD_REASON,
      primaryPickId: input.primaryPickId,
    };
  }
  if (input.primaryPickId !== null) {
    return { role: "refresh", reason: REFRESH_PICK_REASON, primaryPickId: input.primaryPickId };
  }
  // The forecast on a primary pick is frozen under this protocol and never regenerated.
  return { role: "primary", reason: PRIMARY_PICK_REASON, protocolId: PROSPECTIVE_PROTOCOL.id };
}
