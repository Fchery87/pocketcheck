import { describe, expect, it } from "vite-plus/test";
import { classifyPregameRuns, primaryRun, type PregameRun } from "./primary.ts";

const kickoff = "2026-10-26T17:00:00.000Z";

function run(partial: Partial<PregameRun> & Pick<PregameRun, "id" | "completedAt">): PregameRun {
  return {
    gameId: "game-1",
    cutoffAt: "2026-10-26T16:00:00.000Z",
    kickoffAt: kickoff,
    status: "completed",
    ...partial,
  };
}

describe("primary pregame assessment", () => {
  it("picks the earliest completed pregame run and marks later refreshes", () => {
    const runs = [
      run({ id: "refresh", completedAt: "2026-10-26T15:00:00.000Z" }),
      run({ id: "primary", completedAt: "2026-10-26T12:00:00.000Z" }),
      run({ id: "failed", completedAt: null, status: "failed" }),
    ];
    expect(primaryRun(runs)?.id).toBe("primary");
    expect(classifyPregameRuns(runs)).toEqual([
      { role: "refresh", id: "refresh", primaryId: "primary" },
      { role: "primary", id: "primary" },
      { role: "ineligible", id: "failed", reason: "not-completed" },
    ]);
  });

  it("does not use a post-kickoff run as primary even if it finished first", () => {
    const runs = [
      run({
        id: "live",
        completedAt: "2026-10-26T11:00:00.000Z",
        cutoffAt: "2026-10-26T17:05:00.000Z",
      }),
      run({ id: "pregame", completedAt: "2026-10-26T16:30:00.000Z" }),
    ];
    expect(primaryRun(runs)?.id).toBe("pregame");
    expect(classifyPregameRuns(runs)[0]).toEqual({ role: "ineligible", id: "live", reason: "after-kickoff" });
  });

  it("does not accept a final score argument", () => {
    expect(primaryRun.length).toBe(1);
  });
});
