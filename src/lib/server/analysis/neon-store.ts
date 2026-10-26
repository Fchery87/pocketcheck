import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import type { ThesisReport } from "../providers/contracts.ts";
import type { EvidenceFacts, EvidenceItem } from "../sources/contracts.ts";
import {
  JournalRepository,
  type EvidenceRecord,
  type GameRecord,
  type SaveAnalysisInput,
} from "../db/repository.ts";
import type { RunModel } from "./model.ts";
import type { SavedForecast } from "./forecast-record.ts";
import type { PolicyDecision } from "./policy.ts";
import type {
  ActualBet,
  NewRun,
  ProgressStage,
  ResearchRun,
  ResearchStore,
  RunGame,
  RunStatus,
  RunUsage,
} from "./store.ts";

/** What an evidence row's body holds, so the packet item comes back unchanged. */
type EvidenceBody = {
  facts: EvidenceFacts;
  excerpt: string | null;
  factKey: string | null;
  checksum: string | null;
};

function evidenceRow(item: EvidenceItem) {
  const body: EvidenceBody = {
    facts: item.facts,
    excerpt: item.excerpt,
    factKey: item.factKey,
    checksum: item.checksum,
  };
  return {
    packetItemId: item.id,
    sourceId: item.sourceId,
    sourceUrl: item.url,
    retrievedAt: item.retrievedAt,
    publishedAt: item.publishedAt === "unknown" ? null : item.publishedAt,
    effectiveAt: null,
    checksum: item.checksum ?? createHash("sha256").update(JSON.stringify(body)).digest("hex"),
    body,
    origin: item.origin,
    completeness: "packet",
  };
}

function evidenceItem(record: EvidenceRecord): EvidenceItem {
  const body = record.body as EvidenceBody;
  return {
    id: record.packetItemId ?? record.id,
    sourceId: record.sourceId,
    url: record.sourceUrl,
    retrievedAt: record.retrievedAt,
    publishedAt: record.publishedAt ?? "unknown",
    origin: record.origin,
    facts: body.facts ?? {},
    excerpt: body.excerpt ?? null,
    checksum: body.checksum === undefined ? record.checksum : body.checksum,
    factKey: body.factKey ?? null,
  };
}

function runStatus(status: string): RunStatus {
  if (status === "completed" || status === "failed") return status;
  // A pending or running row that is read back belongs to a run that did not finish.
  return "interrupted";
}

export function createNeonStore(sql: Sql): ResearchStore {
  const journal = new JournalRepository(sql);

  async function getRun(id: string): Promise<ResearchRun | null> {
    const saved = await journal.findRun(id);
    if (!saved) return null;
    const { game, offer, analysis, report, userResearch, evidence } = saved;
    return {
      id: analysis.id,
      request: analysis.snapshot.request ?? null,
      parentId: analysis.parentId,
      snapshotVersion: analysis.snapshot.version,
      snapshotProvenance: analysis.snapshot.provenance,
      cutoffAt: analysis.cutoffAt,
      status: runStatus(analysis.status),
      stages: (analysis.stages as ProgressStage[] | null) ?? [],
      game: toRunGame(game),
      offer: {
        gameId: game.sourceGameId,
        sportsbook: offer.sportsbook,
        market: offer.market,
        selection: offer.selection,
        pointLine: offer.pointLine,
        americanOdds: offer.americanOdds,
        decimalOdds: offer.decimalOdds,
        observedAt: isoTimestamp(offer.observedAt),
        kickoffAt: isoTimestamp(offer.kickoffAt),
        rules: offer.rules,
        opposing: offer.opposing,
      },
      lean: userResearch
        ? { text: userResearch.lean ?? "", rationale: userResearch.rationale ?? "" }
        : null,
      evidence: evidence.map(evidenceItem),
      evidencePacketHash: analysis.evidencePacketHash ?? "",
      gaps: Array.isArray(analysis.gaps) ? (analysis.gaps as string[]) : [],
      usage: (analysis.usage as RunUsage | null) ?? null,
      probabilityModel: (analysis.probabilityModel as RunModel | null) ?? null,
      forecast: (analysis.snapshot.forecast as SavedForecast | null | undefined) ?? null,
      report: (report?.body as ThesisReport | null | undefined) ?? null,
      renderedText: report?.renderedText ?? "",
      failureReason: analysis.failureReason,
      policy: (analysis.policy as PolicyDecision | null) ?? null,
      provider: analysis.provider ?? "unknown",
      model: analysis.model ?? "unknown",
      createdAt: analysis.createdAt,
    };
  }

  return {
    async beginAttempt(run) {
      const saved = await journal.saveCompletedAnalysis(journalInput(run, true));
      if (saved.analysis.snapshot.request?.hash !== run.request?.hash) {
        return {
          kind: "conflict",
          error: "This request identifier was already used with different inputs.",
        };
      }
      const existing = await getRun(saved.analysis.id);
      if (!existing) throw new Error(`Analysis was not persisted: ${saved.analysis.id}`);
      return { kind: saved.created ? "created" : "existing", run: existing };
    },
    async updateAttempt(run) {
      await journal.updateAnalysisProgress(journalInput(run, false));
      const saved = await getRun(run.id!);
      if (!saved) throw new Error(`Analysis was not persisted: ${run.id}`);
      return saved;
    },
    async saveRun(run) {
      await journal.completeAnalysisAttempt(journalInput(run, false));
      const saved = await getRun(run.id!);
      if (!saved) throw new Error(`Analysis was not persisted: ${run.id}`);
      return saved;
    },
    getRun,
    listCompleted: () => journal.listCompletedSummaries(),
    async markInterrupted(id) {
      await journal.markInterrupted(id);
      return getRun(id);
    },
    async recordBet(bet) {
      const saved = await journal.findRun(bet.analysisId);
      if (!saved) throw new Error(`Analysis not found: ${bet.analysisId}`);
      const record = await journal.recordBet({
        offerId: saved.offer.id,
        analysisId: bet.analysisId,
        americanOdds: bet.americanOdds,
        placedAt: bet.placedAt,
        stakeUnits: bet.stakeUnits,
        sportsbook: bet.sportsbook,
      });
      return toBet(record);
    },
    async listBets() {
      const records = await journal.listBets();
      return records.filter((record) => record.analysisId !== null).map(toBet);
    },
  };
}

function toRunGame(game: GameRecord): RunGame {
  return {
    id: game.sourceGameId,
    season: game.season,
    week: game.week,
    home: game.homeTeam,
    away: game.awayTeam,
    kickoff: isoTimestamp(game.kickoffAt),
    venue: game.venue,
  };
}

function isoTimestamp(value: string): string {
  return new Date(value).toISOString();
}

function journalInput(run: NewRun, includeUserResearch: boolean): SaveAnalysisInput {
  return {
    game: {
      sourceGameId: run.game.id,
      season: run.game.season,
      week: run.game.week,
      awayTeam: run.game.away,
      homeTeam: run.game.home,
      kickoffAt: run.game.kickoff,
      venue: run.game.venue,
      status: "scheduled",
    },
    offer: {
      gameId: run.offer.gameId,
      sportsbook: run.offer.sportsbook,
      market: run.offer.market,
      selection: run.offer.selection,
      pointLine: run.offer.pointLine,
      americanOdds: run.offer.americanOdds,
      decimalOdds: run.offer.decimalOdds,
      observedAt: run.offer.observedAt,
      enteredAt: run.cutoffAt,
      kickoffAt: run.offer.kickoffAt,
      rules: run.offer.rules,
      opposing: run.offer.opposing,
    },
    evidence: run.evidence.map(evidenceRow),
    analysis: {
      id: run.id,
      parentId: run.parentId,
      cutoffAt: run.cutoffAt,
      status: run.status,
      conclusion: run.policy?.conclusion ?? run.report?.conclusion ?? null,
      policyVersion: run.policy?.policyVersion ?? null,
      policy: run.policy,
      stages: run.stages,
      gaps: run.gaps,
      usage: run.usage,
      probabilityModel: run.probabilityModel,
      forecast: run.forecast,
      evidencePacketHash: run.evidencePacketHash,
      provider: run.provider,
      model: run.model,
      failureReason: run.failureReason,
      idempotencyKey: run.request?.id,
      request: run.request ?? undefined,
    },
    report: run.report
      ? {
          claims: run.report.claims,
          thesis: run.report.summary,
          renderedText: run.renderedText,
          body: run.report,
        }
      : undefined,
    ...(includeUserResearch && run.lean
      ? { userResearch: { lean: run.lean.text, rationale: run.lean.rationale } }
      : {}),
  };
}

function toBet(record: Awaited<ReturnType<JournalRepository["listBets"]>>[number]): ActualBet {
  return {
    id: record.id,
    analysisId: record.analysisId!,
    sportsbook: record.sportsbook ?? "",
    americanOdds: record.americanOdds,
    stakeUnits: record.stakeUnits,
    placedAt: record.placedAt,
  };
}
