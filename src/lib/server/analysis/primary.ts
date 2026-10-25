export type PregameRun = {
  id: string;
  gameId: string;
  completedAt: string | null;
  cutoffAt: string;
  kickoffAt: string;
  status: "pending" | "running" | "completed" | "failed" | "interrupted";
};

export type PrimaryChoice =
  | { role: "primary"; id: string }
  | { role: "refresh"; id: string; primaryId: string }
  | { role: "ineligible"; id: string; reason: "not-completed" | "after-kickoff" | "no-primary" };

/**
 * The primary eligible assessment is the earliest completed run whose cutoff
 * is strictly before kickoff. Later completed pregame runs are refreshes.
 * The final score is not an input.
 */
export function classifyPregameRuns(runs: PregameRun[]): PrimaryChoice[] {
  const completedPregame = runs
    .filter(
      (run) =>
        run.status === "completed" &&
        run.completedAt !== null &&
        Date.parse(run.cutoffAt) < Date.parse(run.kickoffAt),
    )
    .slice()
    .sort((left, right) => {
      const byComplete = Date.parse(left.completedAt!) - Date.parse(right.completedAt!);
      if (byComplete !== 0) return byComplete;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });

  const primaryByGame = new Map<string, string>();
  for (const run of completedPregame) {
    if (!primaryByGame.has(run.gameId)) primaryByGame.set(run.gameId, run.id);
  }

  return runs.map((run) => {
    const primaryId = primaryByGame.get(run.gameId);
    if (run.status !== "completed" || run.completedAt === null) {
      return { role: "ineligible", id: run.id, reason: "not-completed" };
    }
    if (!(Date.parse(run.cutoffAt) < Date.parse(run.kickoffAt))) {
      return { role: "ineligible", id: run.id, reason: "after-kickoff" };
    }
    if (!primaryId) {
      return { role: "ineligible", id: run.id, reason: "no-primary" };
    }
    if (run.id === primaryId) return { role: "primary", id: run.id };
    return { role: "refresh", id: run.id, primaryId };
  });
}

export function primaryRun(runs: PregameRun[]): PregameRun | null {
  const choice = classifyPregameRuns(runs).find((item) => item.role === "primary");
  if (!choice) return null;
  return runs.find((run) => run.id === choice.id) ?? null;
}
