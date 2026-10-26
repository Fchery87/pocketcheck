import { describe, expect, it } from "vite-plus/test";
import {
  JournalRepository,
  type JournalExport,
} from "../../src/lib/server/db/repository.ts";
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

describe("journal backup download", () => {
  it("downloads a versioned backup of recovery records and omits secrets", async () => {
    const isolated = await isolatedDb();
    const journal = new JournalRepository(isolated.db);
    const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const secret = `sk-sentinel-${stamp}`;
    try {
      const saved = await journal.saveCompletedAnalysis({
        game: {
          sourceGameId: `nfl-backup-${stamp}`,
          season: 2026,
          week: 9,
          awayTeam: "BUF",
          homeTeam: "KC",
          kickoffAt: "2026-11-08T21:20:00.000Z",
          venue: "Arrowhead",
          status: "scheduled",
        },
        offer: {
          gameId: "pending",
          sportsbook: "ExampleBook",
          market: "spread",
          selection: "home",
          pointLine: -2.5,
          americanOdds: -105,
          observedAt: "2026-11-07T18:00:00.000Z",
          enteredAt: "2026-11-07T18:05:00.000Z",
          kickoffAt: "2026-11-08T21:20:00.000Z",
          rules: { period: "full-game", overtime: "included", tie: null },
          opposing: null,
        },
        evidence: [
          {
            sourceId: "manual:injury",
            sourceUrl: null,
            retrievedAt: "2026-11-07T17:00:00.000Z",
            publishedAt: "2026-11-07T16:00:00.000Z",
            effectiveAt: "2026-11-07T16:00:00.000Z",
            checksum: `ev-${stamp}`,
            body: { team: "KC", note: "fresh manual coverage" },
            origin: "manual",
            completeness: "complete",
          },
        ],
        analysis: {
          cutoffAt: "2026-11-07T18:05:00.000Z",
          status: "failed",
          conclusion: null,
          failureReason: "provider interrupted",
          idempotencyKey: `backup-${stamp}`,
          policy: { version: "policy-1", conclusion: "pass" },
          gaps: ["away injury coverage unavailable"],
          usage: { promptTokens: 11, completionTokens: null, totalTokens: null, partial: true },
          providerRequests: [
            {
              requestId: `req-${stamp}`,
              role: "draft",
              outcome: "ambiguous",
              response: { text: "durable partial draft", authorization: `Bearer ${secret}` },
              promptTokens: 11,
              completionTokens: null,
              totalTokens: null,
              costUsd: null,
              costKnown: false,
            },
          ],
          providerOutcomeAmbiguous: true,
          forecast: {
            version: 1,
            provenance: "captured",
            decisionCutoff: "2026-11-07T18:05:00.000Z",
            inputAvailability: { version: "1", results: "pre-cutoff", starters: "assumed" },
            artifact: { checksum: `art-${stamp}`, version: 1 },
            features: { restDays: 7 },
            starters: {
              home: { state: "assumed", identity: "starter-home", evidenceAt: "2026-11-07T12:00:00.000Z" },
              away: { state: "unknown", identity: null, evidenceAt: null },
            },
            marketEligibility: { market: "spread", eligible: false },
            probabilities: { win: 0.52, loss: 0.44, push: 0.04 },
            uncertainty: { available: false, reason: "not released" },
            policyVersion: "policy-1",
          },
        },
      });
      const bet = await journal.recordBet({
        offerId: saved.offer.id,
        analysisId: saved.analysis.id,
        submissionId: `sub-${stamp}`,
        contract: {
          market: "spread",
          selection: "home",
          pointLine: -3,
          rules: { period: "full-game", overtime: "included", tie: "push" },
        },
        americanOdds: -110,
        placedAt: "2026-11-07T19:00:00.000Z",
        stakeUnits: 2,
        sportsbook: "PlacedBook",
      });
      const closing = await journal.recordClosing({
        betId: bet.id,
        sportsbook: "PlacedBook",
        market: "spread",
        selection: "home",
        pointLine: -3,
        rules: { period: "full-game", overtime: "included", tie: "push" },
        americanOdds: -108,
        observedAt: "2026-11-08T21:00:00.000Z",
        source: "closing board",
      });
      await isolated.db`
        INSERT INTO settings (key, value)
        VALUES ('provider_key', ${JSON.stringify({ apiKey: secret })})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;

      const backup = await journal.exportJournal();
      const text = JSON.stringify(backup);
      expect(backup.version).toBe(1);
      expect(backup.analyses.map((row) => row.id)).toContain(saved.analysis.id);
      expect(backup.analyses[0]?.parentId ?? null).toBeNull();
      expect(backup.analyses[0]?.createdAt).toBe(saved.analysis.createdAt);
      expect(backup.analyses[0]?.snapshot.provenance).toBeDefined();
      expect(backup.analyses[0]?.gaps).toEqual(["away injury coverage unavailable"]);
      expect(backup.analyses[0]?.snapshot.providerRequests?.[0]?.outcome).toBe("ambiguous");
      expect(backup.analyses[0]?.snapshot.providerRequests?.[0]?.response).toEqual({
        text: "durable partial draft",
      });
      expect(backup.analyses[0]?.snapshot.forecast?.artifact.checksum).toBe(`art-${stamp}`);
      expect(backup.bets[0]?.stakeUnits).toBe(2);
      expect(backup.bets[0]?.contract?.pointLine).toBe(-3);
      expect(backup.closings.map((row) => row.id)).toContain(closing.id);
      expect(backup.closings[0]?.observedAt).toBe("2026-11-08T21:00:00.000Z");
      expect(text).not.toContain(secret);
      expect(text).not.toContain("authorization");
      expect(text).not.toContain("apiKey");
    } finally {
      await isolated.drop();
    }
  }, 120_000);
});

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

function emptyBackup(): JournalExport {
  return {
    version: 1,
    games: [],
    offers: [],
    evidence: [],
    analyses: [],
    reports: [],
    userResearch: [],
    bets: [],
    settlements: [],
    closings: [],
  };
}

describe("journal restore", () => {
  it("rejects an unsupported version before writing any row", async () => {
    const isolated = await isolatedDb();
    const journal = new JournalRepository(isolated.db);
    const gameId = "11111111-1111-4111-8111-111111111111";
    const damaged = {
      ...emptyBackup(),
      version: 2 as never,
      games: [
        {
          id: gameId,
          sourceGameId: "rejected-version",
          season: 2026,
          week: 9,
          awayTeam: "BUF",
          homeTeam: "KC",
          kickoffAt: "2026-11-08T21:20:00.000Z",
          venue: null,
          status: "scheduled",
        },
      ],
    };
    try {
      await expect(journal.restoreJournal(damaged)).rejects.toThrow(/version/i);
      const games = await isolated.db<{ count: number }[]>`
        SELECT count(*)::int AS count FROM games
      `;
      expect(games[0]?.count).toBe(0);
    } finally {
      await isolated.drop();
    }
  }, 120_000);

  it("rejects a missing parent before writing the child analysis", async () => {
    const isolated = await isolatedDb();
    const journal = new JournalRepository(isolated.db);
    const gameId = "22222222-2222-4222-8222-222222222222";
    const offerId = "33333333-3333-4333-8333-333333333333";
    const analysisId = "44444444-4444-4444-8444-444444444444";
    const missingParent = "55555555-5555-4555-8555-555555555555";
    const damaged: JournalExport = {
      ...emptyBackup(),
      games: [
        {
          id: gameId,
          sourceGameId: "missing-parent",
          season: 2026,
          week: 9,
          awayTeam: "BUF",
          homeTeam: "KC",
          kickoffAt: "2026-11-08T21:20:00.000Z",
          venue: null,
          status: "scheduled",
        },
      ],
      offers: [
        {
          id: offerId,
          gameId,
          sportsbook: "ExampleBook",
          market: "spread",
          selection: "home",
          pointLine: -2.5,
          americanOdds: -110,
          decimalOdds: 1.91,
          observedAt: "2026-11-07T18:00:00.000Z",
          enteredAt: "2026-11-07T18:05:00.000Z",
          kickoffAt: "2026-11-08T21:20:00.000Z",
          rules: { period: "full-game", overtime: "included", tie: null },
          opposing: null,
          completedAt: "2026-11-07T18:05:00.000Z",
        },
      ],
      analyses: [
        {
          id: analysisId,
          offerId,
          parentId: missingParent,
          snapshot: {
            version: 1,
            provenance: "captured",
            game: {
              id: gameId,
              sourceGameId: "missing-parent",
              season: 2026,
              week: 9,
              awayTeam: "BUF",
              homeTeam: "KC",
              kickoffAt: "2026-11-08T21:20:00.000Z",
              venue: null,
              status: "scheduled",
            },
            offer: {
              id: offerId,
              gameId,
              sportsbook: "ExampleBook",
              market: "spread",
              selection: "home",
              pointLine: -2.5,
              americanOdds: -110,
              decimalOdds: 1.91,
              observedAt: "2026-11-07T18:00:00.000Z",
              enteredAt: "2026-11-07T18:05:00.000Z",
              kickoffAt: "2026-11-08T21:20:00.000Z",
              rules: { period: "full-game", overtime: "included", tie: null },
              opposing: null,
              completedAt: "2026-11-07T18:05:00.000Z",
            },
          },
          cutoffAt: "2026-11-07T18:05:00.000Z",
          status: "pending",
          conclusion: null,
          methodVersion: null,
          policyVersion: null,
          schemaVersion: null,
          promptVersion: null,
          evidencePacketHash: null,
          provider: null,
          model: null,
          failureReason: null,
          idempotencyKey: "pending-restore",
          completedAt: null,
          createdAt: "2026-11-07T18:05:00.000Z",
          policy: null,
          stages: null,
          gaps: null,
          usage: null,
          probabilityModel: null,
          evidenceIds: [],
          assessmentRole: null,
          assessmentRoleReason: null,
          primaryAnalysisId: null,
        },
      ],
    };
    try {
      await expect(journal.restoreJournal(damaged)).rejects.toThrow(/parent|relationship/i);
      const counts = await isolated.db<{ games: number; analyses: number }[]>`
        SELECT (SELECT count(*)::int FROM games) AS games,
               (SELECT count(*)::int FROM analyses) AS analyses
      `;
      expect(counts[0]).toEqual({ games: 0, analyses: 0 });
    } finally {
      await isolated.drop();
    }
  }, 120_000);

  it("rejects a conflicting identifier without replacing saved history", async () => {
    const isolated = await isolatedDb();
    const journal = new JournalRepository(isolated.db);
    const stamp = `conflict-${Date.now()}`;
    try {
      const saved = await journal.saveCompletedAnalysis({
        game: {
          sourceGameId: stamp,
          season: 2026,
          week: 9,
          awayTeam: "BUF",
          homeTeam: "KC",
          kickoffAt: "2026-11-08T21:20:00.000Z",
          venue: "Arrowhead",
          status: "scheduled",
        },
        offer: {
          gameId: "pending",
          sportsbook: "ExampleBook",
          market: "spread",
          selection: "home",
          pointLine: -2.5,
          americanOdds: -110,
          observedAt: "2026-11-07T18:00:00.000Z",
          enteredAt: "2026-11-07T18:05:00.000Z",
          kickoffAt: "2026-11-08T21:20:00.000Z",
          rules: { period: "full-game", overtime: "included", tie: null },
          opposing: null,
        },
        evidence: [],
        analysis: {
          cutoffAt: "2026-11-07T18:05:00.000Z",
          status: "completed",
          conclusion: "pass",
          idempotencyKey: stamp,
        },
      });
      const original = await journal.exportJournal([saved.analysis.id]);
      const conflicting = structuredClone(original);
      conflicting.analyses[0]!.conclusion = "bet";
      await expect(journal.restoreJournal(conflicting)).rejects.toThrow(/conflict/i);
      const reread = await journal.exportJournal([saved.analysis.id]);
      expect(sortedById(reread)).toEqual(sortedById(original));
    } finally {
      await isolated.drop();
    }
  }, 120_000);
});
