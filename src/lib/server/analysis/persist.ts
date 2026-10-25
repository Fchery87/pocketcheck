import { createHash } from "node:crypto";
import type { ResearchRun } from "./memory-journal.ts";
import { closeDb, createDb } from "../db/client.ts";
import { JournalRepository } from "../db/repository.ts";

function loadDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === "") return null;
  return url;
}

export async function persistCompletedRun(
  run: ResearchRun,
): Promise<{ saved: boolean; error?: string }> {
  const databaseUrl = loadDatabaseUrl();
  if (!databaseUrl || run.status !== "completed") return { saved: false };
  const db = createDb(databaseUrl);
  try {
    const journal = new JournalRepository(db);
    const checksum = createHash("sha256").update(run.evidencePacketSent).digest("hex");
    await journal.saveCompletedAnalysis({
      game: {
        sourceGameId: run.game.id,
        season: run.game.season,
        week: run.game.week,
        awayTeam: run.game.away,
        homeTeam: run.game.home,
        kickoffAt: run.game.kickoff,
        venue: run.game.venue.name,
        status: "scheduled",
      },
      offer: {
        gameId: "pending",
        sportsbook: run.offer.sportsbook,
        market: run.offer.market,
        selection: run.offer.selection,
        pointLine: run.offer.pointLine,
        americanOdds: run.offer.americanOdds,
        decimalOdds: run.offer.decimalOdds,
        observedAt: run.offer.observedAt,
        enteredAt: run.createdAt,
        kickoffAt: run.offer.kickoffAt,
        rules: run.offer.rules,
        opposing: run.offer.opposing,
      },
      evidence: [
        {
          sourceId: "analysis-packet",
          sourceUrl: null,
          retrievedAt: run.createdAt,
          publishedAt: null,
          effectiveAt: null,
          checksum,
          body: { excerpt: run.renderedText.slice(0, 500) },
          origin: "automatic",
          completeness: "fixture-or-run",
        },
      ],
      analysis: {
        id: run.id,
        parentId: run.parentId,
        cutoffAt: run.offer.observedAt,
        status: "completed",
        conclusion: run.report?.conclusion ?? null,
        idempotencyKey: `run:${run.id}`,
        provider: "fixture-or-selected",
        model: "recorded-with-run",
      },
      report: {
        claims: run.report?.claims ?? [],
        thesis: run.report?.summary ?? "",
        renderedText: run.renderedText,
      },
      userResearch: run.lean
        ? { lean: run.lean.text, rationale: run.lean.rationale }
        : undefined,
    });
    return { saved: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "save failed";
    return { saved: false, error: message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]") };
  } finally {
    await closeDb(db);
  }
}
