export type AssessmentRoleChoice =
  | { role: "primary"; reason: string }
  | { role: "refresh"; primaryId: string; reason: string }
  | { role: "ineligible"; reason: string };

export const PRIMARY_REASON = "Earliest completed analysis before kickoff";
export const REFRESH_REASON = "Later completed analysis. The primary assessment is unchanged.";
export const NOT_COMPLETED_REASON = "This analysis did not complete before kickoff.";
export const AFTER_KICKOFF_REASON =
  "Decision cutoff is not before kickoff, so this analysis is not an eligible pregame assessment.";
export const REFRESH_WITHOUT_PRIMARY_REASON =
  "A refresh is never the primary assessment, and this game has no primary assessment.";

/**
 * The frozen role of an analysis, chosen once when it reaches a terminal status. The primary is the
 * earliest completed analysis whose cutoff is strictly before kickoff. The caller serializes
 * completions per game, so `primaryId` is the primary already frozen for the game, if any. A
 * refresh is never primary, even when its parent was never classified. The final score is not an
 * input.
 */
export function chooseAssessmentRole(input: {
  status: "completed" | "failed" | "interrupted";
  cutoffAt: string;
  kickoffAt: string;
  parentId: string | null;
  primaryId: string | null;
}): AssessmentRoleChoice {
  if (input.status !== "completed") return { role: "ineligible", reason: NOT_COMPLETED_REASON };
  if (!(Date.parse(input.cutoffAt) < Date.parse(input.kickoffAt))) {
    return { role: "ineligible", reason: AFTER_KICKOFF_REASON };
  }
  if (input.primaryId !== null) {
    return { role: "refresh", primaryId: input.primaryId, reason: REFRESH_REASON };
  }
  if (input.parentId !== null) {
    return { role: "ineligible", reason: REFRESH_WITHOUT_PRIMARY_REASON };
  }
  return { role: "primary", reason: PRIMARY_REASON };
}
