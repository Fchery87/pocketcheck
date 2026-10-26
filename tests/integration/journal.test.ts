import { describe, expect, it } from "vite-plus/test";
import { JournalRepository } from "../../src/lib/server/db/repository.ts";
import { isolatedDb } from "./isolated-db.ts";

/** Export queries carry no order, so compare each table sorted by id. */
function sortedById<T extends Record<string, unknown>>(snapshot: T): T {
  return Object.fromEntries(
    Object.entries(snapshot).map(([key, rows]) => [
      key,
      Array.isArray(rows)
        ? [...rows].sort((left, right) => String(left.id).localeCompare(String(right.id)))
        : rows,
    ]),
  ) as T;
}

describe("immutable journal", () => {
  it("keeps versions, bets, settlements, and a secret-free export", async () => {
    const isolated = await isolatedDb();
    const db = isolated.db;
    const journal = new JournalRepository(db);
    const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      const saved = await journal.saveCompletedAnalysis({
        game: {
          sourceGameId: `nfl-2026-week-8-${stamp}`,
          season: 2026,
          week: 8,
          awayTeam: "BUF",
          homeTeam: "KC",
          kickoffAt: "2026-11-02T21:20:00.000Z",
          venue: "Arrowhead",
          status: "scheduled",
        },
        offer: {
          gameId: "pending",
          sportsbook: "ExampleBook",
          market: "spread",
          selection: "home",
          pointLine: -3,
          americanOdds: -110,
          observedAt: "2026-11-01T18:00:00.000Z",
          enteredAt: "2026-11-01T18:05:00.000Z",
          kickoffAt: "2026-11-02T21:20:00.000Z",
          rules: { period: "full-game", overtime: "included", tie: null },
          opposing: null,
        },
        evidence: [
          {
            sourceId: "nflverse:schedule",
            sourceUrl: "https://example.test/schedule",
            retrievedAt: "2026-11-01T17:00:00.000Z",
            publishedAt: "2026-10-01T00:00:00.000Z",
            effectiveAt: null,
            checksum: `checksum-${stamp}`,
            body: { note: "home favorite context" },
            origin: "automatic",
            completeness: "complete",
          },
        ],
        analysis: {
          cutoffAt: "2026-11-01T18:05:00.000Z",
          status: "completed",
          conclusion: "pass",
          methodVersion: "math-1",
          idempotencyKey: `analysis-${stamp}`,
        },
        report: {
          claims: [{ text: "Price requires a high cover rate." }],
          thesis: "Pass. The recorded price is not a value candidate.",
          renderedText: `report-bytes-${stamp}`,
        },
        userResearch: { lean: "home", rationale: "private lean stays separate" },
      });

      const readBack = await journal.readRun(saved.analysis.id);
      expect(readBack.offer.americanOdds).toBe(-110);
      expect(readBack.offer.pointLine).toBe(-3);
      expect(readBack.evidence).toHaveLength(1);
      expect(readBack.evidence[0]?.checksum).toBe(`checksum-${stamp}`);
      expect(readBack.report?.renderedText).toBe(`report-bytes-${stamp}`);
      expect(readBack.analysis.conclusion).toBe("pass");
      expect(readBack.userResearch?.lean).toBe("home");

      const refresh = await journal.saveCompletedAnalysis({
        game: {
          sourceGameId: `nfl-2026-week-8-${stamp}`,
          season: 2026,
          week: 8,
          awayTeam: "BUF",
          homeTeam: "KC",
          kickoffAt: "2026-11-02T21:20:00.000Z",
          venue: "Arrowhead",
          status: "scheduled",
        },
        offer: {
          gameId: readBack.game.id,
          sportsbook: "ExampleBook",
          market: "spread",
          selection: "home",
          pointLine: -3.5,
          americanOdds: -105,
          observedAt: "2026-11-02T12:00:00.000Z",
          enteredAt: "2026-11-02T12:01:00.000Z",
          kickoffAt: "2026-11-02T21:20:00.000Z",
          rules: { period: "full-game", overtime: "included", tie: null },
          opposing: null,
        },
        evidence: [
          {
            sourceId: "manual:note",
            sourceUrl: null,
            retrievedAt: "2026-11-02T12:00:00.000Z",
            publishedAt: null,
            effectiveAt: null,
            checksum: `refresh-${stamp}`,
            body: { note: "line moved" },
            origin: "manual",
            completeness: "complete",
          },
        ],
        analysis: {
          parentId: saved.analysis.id,
          cutoffAt: "2026-11-02T12:01:00.000Z",
          status: "completed",
          conclusion: "wait",
          idempotencyKey: `refresh-${stamp}`,
        },
        report: {
          claims: [{ text: "Line moved." }],
          thesis: "Wait for a comparable price.",
          renderedText: `refresh-bytes-${stamp}`,
        },
      });

      const original = await journal.readRun(saved.analysis.id);
      expect(original.offer.americanOdds).toBe(-110);
      expect(original.offer.pointLine).toBe(-3);
      expect(original.evidence[0]?.checksum).toBe(`checksum-${stamp}`);
      expect(original.report?.renderedText).toBe(`report-bytes-${stamp}`);
      expect(refresh.analysis.parentId).toBe(saved.analysis.id);
      expect(refresh.report?.renderedText).toBe(`refresh-bytes-${stamp}`);

      // The evidence insert violates its CHECK after the child analysis row is written.
      await expect(
        journal.saveCompletedAnalysis({
          game: readBack.game,
          offer: { ...refresh.offer, id: undefined, americanOdds: -120 },
          evidence: [
            {
              sourceId: "manual:note",
              sourceUrl: null,
              retrievedAt: "2026-11-02T12:00:00.000Z",
              publishedAt: null,
              effectiveAt: null,
              checksum: `rejected-${stamp}`,
              body: { note: "rejected" },
              origin: "invented" as never,
              completeness: "complete",
            },
          ],
          analysis: {
            parentId: saved.analysis.id,
            cutoffAt: "2026-11-02T12:01:00.000Z",
            status: "completed",
            conclusion: "pass",
          },
        }),
      ).rejects.toThrow(/evidence_origin_check/);
      const afterFailure = await journal.readRun(saved.analysis.id);
      expect(afterFailure.offer.id).toBe(original.offer.id);
      expect(afterFailure.analysis.conclusion).toBe("pass");
      const childCount = await db<{ count: string }[]>`
          SELECT count(*)::text AS count FROM analyses WHERE parent_id = ${saved.analysis.id}
        `;
      expect(childCount[0]?.count).toBe("1");

      const duplicate = await journal.saveCompletedAnalysis({
        game: {
          sourceGameId: `unused-${stamp}`,
          season: 2026,
          week: 8,
          awayTeam: "BUF",
          homeTeam: "KC",
          kickoffAt: "2026-11-02T21:20:00.000Z",
          venue: null,
          status: "scheduled",
        },
        offer: {
          gameId: "unused",
          sportsbook: "ExampleBook",
          market: "moneyline",
          selection: "away",
          americanOdds: 130,
          observedAt: "2026-11-01T18:00:00.000Z",
          enteredAt: "2026-11-01T18:05:00.000Z",
          kickoffAt: "2026-11-02T21:20:00.000Z",
          rules: { period: "full-game", overtime: "included", tie: "push" },
          opposing: null,
        },
        evidence: [],
        analysis: {
          cutoffAt: "2026-11-01T18:05:00.000Z",
          status: "completed",
          conclusion: "pass",
          idempotencyKey: `analysis-${stamp}`,
        },
      });
      expect(duplicate.created).toBe(false);
      expect(duplicate.analysis.id).toBe(saved.analysis.id);
      const keyed = await db<{ count: string }[]>`
          SELECT count(*)::text AS count FROM analyses WHERE idempotency_key = ${`analysis-${stamp}`}
        `;
      expect(keyed[0]?.count).toBe("1");

      const bet = await journal.recordBet({
        offerId: original.offer.id,
        analysisId: original.analysis.id,
        americanOdds: -108,
        placedAt: "2026-11-01T19:00:00.000Z",
        stakeUnits: 1.5,
      });
      expect(bet.americanOdds).toBe(-108);
      expect(bet.stakeUnits).toBe(1.5);
      expect(bet.placedAt).toBe("2026-11-01T19:00:00.000Z");
      expect(original.analysis.conclusion).toBe("pass");

      const first = await journal.recordSettlement({
        betId: bet.id,
        offerId: original.offer.id,
        result: "win",
        rules: "full-game including overtime",
        source: "official",
        settledAt: "2026-11-03T02:00:00.000Z",
      });
      const corrected = await journal.correctSettlement({
        settlementId: first.id,
        result: "push",
        reason: "official score correction",
        source: "official-correction",
        settledAt: "2026-11-03T15:00:00.000Z",
      });
      const history = await journal.settlementHistory(corrected.id);
      expect(history.map((row) => row.result)).toEqual(["win", "push"]);
      expect(history[1]?.reason).toBe("official score correction");
      expect(history[0]?.id).toBe(first.id);

      // Corrections are new rows; nothing already recorded can change or disappear.
      const mutations = [
        db`UPDATE user_research SET lean = 'away' WHERE analysis_id = ${saved.analysis.id}`,
        db`DELETE FROM user_research WHERE analysis_id = ${saved.analysis.id}`,
        db`UPDATE analysis_evidence SET completeness = 'partial' WHERE analysis_id = ${saved.analysis.id}`,
        db`DELETE FROM analysis_evidence WHERE analysis_id = ${saved.analysis.id}`,
        db`UPDATE bets SET stake_units = 9 WHERE id = ${bet.id}`,
        db`DELETE FROM bets WHERE id = ${bet.id}`,
        db`UPDATE settlements SET result = 'loss' WHERE id = ${first.id}`,
        db`DELETE FROM settlements WHERE id = ${corrected.id}`,
      ];
      for (const mutation of mutations) {
        await expect(mutation).rejects.toThrow(/append-only/);
      }

      const exported = await journal.exportJournal([saved.analysis.id, refresh.analysis.id]);
      const serialized = JSON.stringify(exported);
      expect(serialized).not.toContain("npg_");
      expect(serialized).not.toContain("postgresql://");
      expect(serialized).not.toContain("API_KEY");
      expect(exported.offers.map((row) => row.observedAt)).toEqual([
        "2026-11-01T18:00:00.000Z",
        "2026-11-02T12:00:00.000Z",
      ]);

      // Restore into an empty database, parents listed after their children.
      const target = await isolatedDb();
      try {
        const targetJournal = new JournalRepository(target.db);
        const shuffled = {
          ...exported,
          analyses: [...exported.analyses].reverse(),
          settlements: [...exported.settlements].reverse(),
        };
        const restored = await targetJournal.restoreJournal(shuffled);
        expect(sortedById(restored)).toEqual(sortedById(exported));
        expect(restored.games[0]?.sourceGameId).toBe(`nfl-2026-week-8-${stamp}`);

        // A second restore of the same snapshot changes nothing.
        const again = await targetJournal.restoreJournal(exported);
        expect(sortedById(again)).toEqual(sortedById(exported));
        const counts = await target.db<{ analyses: number; settlements: number }[]>`
          SELECT (SELECT count(*)::int FROM analyses) AS analyses,
                 (SELECT count(*)::int FROM settlements) AS settlements
        `;
        expect(counts[0]).toEqual({ analyses: 2, settlements: 2 });
      } finally {
        await target.drop();
      }
    } finally {
      await isolated.drop();
    }
  }, 120_000);
});
