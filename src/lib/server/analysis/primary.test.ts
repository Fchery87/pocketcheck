import { describe, expect, it } from "vite-plus/test";
import { chooseAssessmentRole } from "./primary.ts";

const pregame = {
  status: "completed" as const,
  cutoffAt: "2026-10-26T16:00:00.000Z",
  kickoffAt: "2026-10-26T17:00:00.000Z",
  parentId: null,
  primaryId: null,
};

describe("primary pregame assessment", () => {
  it("makes the first completed pregame analysis of a game primary and later ones refreshes", () => {
    expect(chooseAssessmentRole(pregame)).toEqual({
      role: "primary",
      reason: "Earliest completed analysis before kickoff",
    });
    expect(chooseAssessmentRole({ ...pregame, primaryId: "first" })).toEqual({
      role: "refresh",
      primaryId: "first",
      reason: "Later completed analysis. The primary assessment is unchanged.",
    });
  });

  it("never makes a refresh primary, even when its parent was never classified", () => {
    expect(chooseAssessmentRole({ ...pregame, parentId: "unclassified-parent" })).toEqual({
      role: "ineligible",
      reason: "A refresh is never the primary assessment, and this game has no primary assessment.",
    });
    expect(
      chooseAssessmentRole({ ...pregame, parentId: "parent", primaryId: "parent" }),
    ).toMatchObject({ role: "refresh", primaryId: "parent" });
  });

  it("does not classify an unfinished or post-kickoff analysis as primary", () => {
    expect(chooseAssessmentRole({ ...pregame, status: "failed" }).role).toBe("ineligible");
    expect(chooseAssessmentRole({ ...pregame, status: "interrupted" }).role).toBe("ineligible");
    expect(chooseAssessmentRole({ ...pregame, cutoffAt: pregame.kickoffAt }).reason).toMatch(
      /not before kickoff/,
    );
  });

  it("does not accept a final score argument", () => {
    expect(chooseAssessmentRole.length).toBe(1);
  });
});
