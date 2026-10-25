import { describe, expect, it } from "vite-plus/test";
import { readFile } from "node:fs/promises";
import { closeDb, createDb } from "#lib/server/db/client.ts";
import { persistCompletedRun } from "#lib/server/analysis/persist.ts";
import type { ResearchRun } from "#lib/server/analysis/memory-journal.ts";

function loadEnv(text: string) {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const separator = trimmed.indexOf("=");
    const key = trimmed.slice(0, separator);
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(separator + 1);
  }
}

try {
  loadEnv(await readFile(".env", "utf8"));
} catch {
  // The integration script skips when the URL is absent.
}

const databaseUrl = process.env.DATABASE_URL;
const describePersist = databaseUrl ? describe : describe.skip;

describePersist("completed run persistence", () => {
  it("saves a completed run once and keeps the parent id", async () => {
    const run: ResearchRun = {
      id: "22222222-2222-4222-8222-222222222222",
      parentId: "11111111-1111-4111-8111-111111111111",
      status: "completed",
      stages: ["checking inputs"],
      game: {
        id: "persist-check-refresh",
        season: 2026,
        week: 8,
        home: "PHI",
        away: "DAL",
        kickoff: "2026-11-02T01:20:00.000Z",
        venue: { name: "Lincoln Financial Field", stadiumId: "PHI00", roof: "outdoors" },
        finalScore: null,
        scheduleSpread: null,
      },
      offer: {
        gameId: "persist-check-refresh",
        sportsbook: "Example",
        market: "moneyline",
        selection: "home",
        pointLine: null,
        americanOdds: -105,
        decimalOdds: 1.952380952,
        observedAt: "2026-10-25T16:00:00.000Z",
        kickoffAt: "2026-11-02T01:20:00.000Z",
        rules: { period: "full-game", overtime: "included", tie: "push" },
        opposing: null,
      },
      lean: null,
      evidencePacketSent: "{}",
      report: {
        conclusion: "pass",
        summary: "refresh persist",
        claims: [],
        assumptions: [],
        uncertainty: "none",
        missingInputs: [],
        changeConditions: [],
        decimalOdds: 1.952380952,
        decisiveBreakEven: 0.512195,
      },
      renderedText: "pass",
      failureReason: null,
      policy: null,
      createdAt: "2026-10-25T20:10:00.000Z",
    };
    const parentId = "11111111-1111-4111-8111-111111111111";
    const parent = {
      ...run,
      id: parentId,
      parentId: null,
      offer: { ...run.offer, americanOdds: -110 },
    };
    const child = { ...run, parentId };
    const parentSave = await persistCompletedRun(parent);
    const first = await persistCompletedRun(child);
    const second = await persistCompletedRun(child);
    const db = createDb(databaseUrl!);
    try {
      const rows = await db<{ parent_id: string | null; american_odds: number }[]>`
        select a.parent_id, o.american_odds
        from analyses a
        join offers o on o.id = a.offer_id
        where a.id = ${run.id}
      `;
      expect(parentSave.saved, parentSave.error).toBe(true);
      expect(first.saved, first.error).toBe(true);
      expect(second.saved).toBe(true);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.parent_id).toBe(run.parentId);
      expect(rows[0]?.american_odds).toBe(-105);
    } finally {
      await closeDb(db);
    }
  });
});
