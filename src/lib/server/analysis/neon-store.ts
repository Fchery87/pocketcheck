import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { parseOffer } from "#lib/domain/offer.ts";
import type { ThesisReport } from "../providers/contracts.ts";
import type { EvidenceFacts, EvidenceItem } from "../sources/contracts.ts";
import {
  BetSubmissionConflict,
  JournalRepository,
  type BetContract,
  type EvidenceRecord,
  type GameRecord,
  type SaveAnalysisInput,
} from "../db/repository.ts";
import type { RunModel } from "./model.ts";
import type { SavedForecast } from "./forecast-record.ts";
import type { PolicyDecision } from "./policy.ts";
import {
  gradeFromNotices,
  settlementPayloadKey,
  type ActualBet,
  type AssessmentRole,
  type NewRun,
  type ProgressStage,
  type RecordBetResult,
  type RecordSettlementInput,
  type RecordSettlementResult,
  type ResearchRun,
  type ResearchStore,
  type RunGame,
  type RunStatus,
  type RunUsage,
  type SettlementGrade,
  type StoredNotice,
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
      providerRequests: analysis.snapshot.providerRequests ?? [],
      providerOutcomeAmbiguous: analysis.snapshot.providerOutcomeAmbiguous ?? false,
      probabilityModel: (analysis.probabilityModel as RunModel | null) ?? null,
      forecast: (analysis.snapshot.forecast as SavedForecast | null | undefined) ?? null,
      report: (report?.body as ThesisReport | null | undefined) ?? null,
      renderedText: report?.renderedText ?? "",
      failureReason: analysis.failureReason,
      policy: (analysis.policy as PolicyDecision | null) ?? null,
      provider: analysis.provider ?? "unknown",
      model: analysis.model ?? "unknown",
      createdAt: analysis.createdAt,
      completedAt: analysis.completedAt,
      assessmentRole: storedAssessmentRole(analysis),
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
      if (!bet.submissionId) throw new Error("An actual bet requires a submission identifier.");
      if (!Number.isFinite(bet.stakeUnits) || bet.stakeUnits <= 0) {
        throw new Error("Stake must be a positive number of units");
      }
      const contract = parseOffer({
        gameId: saved.game.sourceGameId,
        sportsbook: bet.sportsbook,
        market: bet.market,
        selection: bet.selection,
        pointLine: bet.pointLine,
        americanOdds: bet.americanOdds,
        observedAt: bet.placedAt,
        kickoffAt: saved.game.kickoffAt,
        rules: bet.rules,
      });
      const stored: BetContract = {
        market: contract.market,
        selection: contract.selection,
        pointLine: contract.pointLine,
        rules: contract.rules,
      };
      const fingerprint = betFingerprint(bet.analysisId, contract, bet.stakeUnits, bet.placedAt);
      const prior = await journal.findBetBySubmissionId(bet.submissionId);
      try {
        const record = await journal.recordBet({
          offerId: saved.offer.id,
          analysisId: bet.analysisId,
          submissionId: bet.submissionId,
          contract: stored,
          contractFingerprint: fingerprint,
          americanOdds: contract.americanOdds,
          placedAt: bet.placedAt,
          stakeUnits: bet.stakeUnits,
          sportsbook: contract.sportsbook,
        });
        return { kind: prior ? "existing" : "created", bet: toBet(record) };
      } catch (error) {
        if (error instanceof BetSubmissionConflict) {
          return { kind: "conflict", error: error.message };
        }
        throw error;
      }
    },
    async listBets() {
      const records = await journal.listBets();
      return records.filter((record) => record.analysisId !== null).map(toBet);
    },
    async recordSettlement(input) {
      return recordNeonSettlement(journal, input);
    },
    async readSettlement(input) {
      return readNeonSettlement(journal, input);
    },
  };
}

function storedAssessmentRole(analysis: {
  assessmentRole: "primary" | "refresh" | "ineligible" | null;
  assessmentRoleReason: string | null;
  primaryAnalysisId: string | null;
  completedAt: string | null;
}): AssessmentRole | null {
  if (!analysis.assessmentRole || !analysis.completedAt) return null;
  if (analysis.assessmentRole === "refresh" && analysis.primaryAnalysisId) {
    return {
      role: "refresh",
      primaryId: analysis.primaryAnalysisId,
      reason: analysis.assessmentRoleReason ?? "",
    };
  }
  if (analysis.assessmentRole === "ineligible") {
    return { role: "ineligible", reason: analysis.assessmentRoleReason ?? "" };
  }
  return { role: "primary", reason: analysis.assessmentRoleReason ?? "" };
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
      providerRequests: run.providerRequests,
      providerOutcomeAmbiguous: run.providerOutcomeAmbiguous,
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
    submissionId: record.submissionId,
    contractProvenance: record.contract ? "captured" : "legacy-unknown",
    sportsbook: record.sportsbook ?? "",
    market: record.contract?.market ?? null,
    selection: record.contract?.selection ?? null,
    pointLine: record.contract?.pointLine ?? null,
    rules: record.contract?.rules ?? null,
    americanOdds: record.americanOdds,
    stakeUnits: record.stakeUnits,
    placedAt: record.placedAt,
  };
}

function betFingerprint(
  analysisId: string,
  contract: { sportsbook: string; market: string; selection: string; pointLine: number | null; americanOdds: number; rules: BetContract["rules"] },
  stakeUnits: number,
  placedAt: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        analysisId,
        sportsbook: contract.sportsbook,
        market: contract.market,
        selection: contract.selection,
        pointLine: contract.pointLine,
        americanOdds: contract.americanOdds,
        rules: contract.rules,
        stakeUnits,
        placedAt,
      }),
    )
    .digest("hex");
}

async function recordNeonSettlement(
  journal: JournalRepository,
  input: RecordSettlementInput,
): Promise<RecordSettlementResult> {
  const saved = await journal.findRun(input.analysisId);
  if (!saved) throw new Error(`Analysis not found: ${input.analysisId}`);
  if (input.betId) {
    const bets = await journal.listBets();
    const bet = bets.find((item) => item.id === input.betId);
    if (!bet || bet.analysisId !== input.analysisId) throw new Error(`Bet not found: ${input.betId}`);
  }
  if (input.correctsNoticeId) {
    if (!input.reason?.trim()) return { kind: "conflict", error: "A correction requires a reason." };
    const prior = await journal.readSettlementNotice(input.correctsNoticeId);
    if (!prior || prior.analysisId !== input.analysisId) {
      throw new Error(`Settlement not found: ${input.correctsNoticeId}`);
    }
  }
  const payloadKey = settlementPayloadKey(input);
  const existing = await journal.findSettlementNoticeByEvent(input.eventId);
  if (existing) {
    if (existing.payloadKey === payloadKey) return { kind: "duplicate", noticeId: existing.id };
    return {
      kind: "conflict",
      error: "This settlement event identifier was already used with different inputs.",
    };
  }
  const id = randomUUID();
  try {
    await journal.insertSettlementNotice({
      id,
      eventId: input.eventId,
      analysisId: input.analysisId,
      betId: input.betId ?? null,
      kind: input.kind,
      homeScore: input.homeScore ?? null,
      awayScore: input.awayScore ?? null,
      source: input.source,
      reason: input.reason ?? null,
      correctsId: input.correctsNoticeId ?? null,
      recordedAt: input.recordedAt,
      payloadKey,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await journal.findSettlementNoticeByEvent(input.eventId);
      if (raced?.payloadKey === payloadKey) return { kind: "duplicate", noticeId: raced.id };
      return {
        kind: "conflict",
        error: "This settlement event identifier was already used with different inputs.",
      };
    }
    throw error;
  }
  return { kind: "recorded", noticeId: id };
}

async function readNeonSettlement(
  journal: JournalRepository,
  input: { analysisId: string; betId?: string | null },
): Promise<{ assessment: SettlementGrade; bet: SettlementGrade | null }> {
  const saved = await journal.findRun(input.analysisId);
  if (!saved) throw new Error(`Analysis not found: ${input.analysisId}`);
  const notices = (await journal.listSettlementNotices(input.analysisId)).map(
    (row): StoredNotice => ({ ...row, payloadKey: "" }),
  );
  const assessment = gradeFromNotices(saved.offer, notices);
  if (!input.betId) return { assessment, bet: null };
  const bets = await journal.listBets();
  const bet = bets.find((item) => item.id === input.betId);
  if (!bet?.contract || bet.analysisId !== input.analysisId) return { assessment, bet: null };
  const contract = parseOffer({
    gameId: saved.game.sourceGameId,
    sportsbook: bet.sportsbook ?? saved.offer.sportsbook,
    market: bet.contract.market,
    selection: bet.contract.selection,
    pointLine: bet.contract.pointLine ?? undefined,
    americanOdds: bet.americanOdds,
    observedAt: bet.placedAt,
    kickoffAt: saved.game.kickoffAt,
    rules: bet.contract.rules,
  });
  return { assessment, bet: gradeFromNotices(contract, notices) };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
