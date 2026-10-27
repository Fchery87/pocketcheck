import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { americanToDecimal } from "#lib/domain/odds.ts";
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
import { compareClosing } from "./closing.ts";
import { createNeonBoardStore } from "./neon-board-store.ts";
import type { GameBoardStore } from "./board-store.ts";
import {
  gradeFromNotices,
  settlementPayloadKey,
  type ActualBet,
  type AssessmentRole,
  type ClosingObservation,
  type ClosingProvenance,
  type NewClosing,
  type NewRun,
  type ProgressStage,
  type RecordSettlementInput,
  type RecordSettlementResult,
  type ResearchRun,
  type JournalStore,
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

export function createNeonStore(sql: Sql): JournalStore {
  const journal = new JournalRepository(sql);
  const boardStore = createNeonBoardStore(sql);

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
        ? {
            text: userResearch.lean ?? "",
            rationale: userResearch.rationale ?? "",
          }
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

  const research: ResearchStore = {
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
      if (!bet.analysisId === !bet.modelPickId) {
        throw new Error("An actual bet belongs to one analysis or one model pick.");
      }
      const saved = bet.analysisId ? await journal.findRun(bet.analysisId) : null;
      if (bet.analysisId && !saved) throw new Error(`Analysis not found: ${bet.analysisId}`);
      const pickBoard = bet.modelPickId ? await boardStore.getBoardForPick(bet.modelPickId) : null;
      if (bet.modelPickId && !pickBoard)
        throw new Error(`Model pick not found: ${bet.modelPickId}`);
      const game = saved
        ? { id: saved.game.sourceGameId, kickoff: saved.game.kickoffAt }
        : { id: pickBoard!.game.id, kickoff: pickBoard!.game.kickoff };
      if (!bet.submissionId) throw new Error("An actual bet requires a submission identifier.");
      if (!Number.isFinite(bet.stakeUnits) || bet.stakeUnits <= 0) {
        throw new Error("Stake must be a positive number of units");
      }
      const contract = parseOffer({
        gameId: game.id,
        sportsbook: bet.sportsbook,
        market: bet.market,
        selection: bet.selection,
        pointLine: bet.pointLine,
        americanOdds: bet.americanOdds,
        observedAt: bet.placedAt,
        kickoffAt: game.kickoff,
        rules: bet.rules,
      });
      const stored: BetContract = {
        market: contract.market,
        selection: contract.selection,
        pointLine: contract.pointLine,
        rules: contract.rules,
      };
      const fingerprint = betFingerprint(
        bet.analysisId,
        bet.modelPickId,
        contract,
        bet.stakeUnits,
        bet.placedAt,
      );
      const prior = await journal.findBetBySubmissionId(bet.submissionId);
      try {
        const record = await journal.recordBet({
          offerId: saved?.offer.id,
          analysisId: bet.analysisId,
          modelPickId: bet.modelPickId,
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
      return records
        .filter((record) => record.analysisId !== null || record.modelPickId)
        .map(toBet);
    },
    async recordSettlement(input) {
      return recordNeonSettlement(journal, boardStore, input);
    },
    async readSettlement(input) {
      return readNeonSettlement(journal, boardStore, input);
    },
    async recordClosing(input) {
      return {
        kind: "created",
        closing: await persistClosing(journal, boardStore, input, "observed"),
      };
    },
    async listClosings() {
      const [records, runs, bets] = await Promise.all([
        journal.listClosings(),
        journal.listCompletedSummaries(),
        journal.listBets(),
      ]);
      const analyses = new Map<string, Awaited<ReturnType<typeof getRun>>>();
      for (const summary of runs) {
        analyses.set(summary.id, await getRun(summary.id));
      }
      const betById = new Map(bets.map((bet) => [bet.id, bet]));
      return records.map((record) => toClosing(record, analyses, betById));
    },
    async recordArchivedClosing(input) {
      return persistClosing(
        journal,
        boardStore,
        {
          ...input,
          rules: { period: "full-game", overtime: "included" },
          observedAt: "",
        },
        "archived-untimestamped",
      );
    },
    async exportJournal() {
      return journal.exportJournal();
    },
    async restoreJournal(backup) {
      return journal.restoreJournal(backup);
    },
  };
  return { ...research, ...boardStore };
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
    analysisId: record.analysisId,
    modelPickId: record.modelPickId ?? null,
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
  analysisId: string | undefined,
  modelPickId: string | undefined,
  contract: {
    sportsbook: string;
    market: string;
    selection: string;
    pointLine: number | null;
    americanOdds: number;
    rules: BetContract["rules"];
  },
  stakeUnits: number,
  placedAt: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        analysisId,
        modelPickId,
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

async function persistClosing(
  journal: JournalRepository,
  boards: Pick<GameBoardStore, "getBoardForPick">,
  input: NewClosing,
  provenance: ClosingProvenance,
): Promise<ClosingObservation> {
  if (!input.source.trim()) throw new Error("A closing observation requires a source.");
  const open = await openSide(journal, boards, input);
  if (provenance === "archived-untimestamped") {
    const record = await journal.recordClosing({
      analysisId: input.subject.kind === "analysis" ? input.subject.id : null,
      betId: input.subject.kind === "bet" ? input.subject.id : null,
      provenance,
      sportsbook: input.sportsbook.trim(),
      market: input.market,
      selection: input.selection,
      pointLine: input.pointLine ?? null,
      rules: {
        period: "full-game",
        overtime: "included",
        tie: input.rules.tie ?? null,
      },
      americanOdds: input.americanOdds,
      observedAt: null,
      source: input.source.trim(),
    });
    return {
      id: record.id,
      subject: input.subject,
      provenance,
      sportsbook: record.sportsbook,
      market: record.market,
      selection: record.selection,
      pointLine: record.pointLine,
      rules: record.rules,
      americanOdds: record.americanOdds,
      observedAt: null,
      source: record.source,
      comparison: { available: false, reason: "archived-untimestamped" },
    };
  }
  const contract = parseOffer({
    gameId: open.gameId,
    sportsbook: input.sportsbook,
    market: input.market,
    selection: input.selection,
    pointLine: input.pointLine,
    americanOdds: input.americanOdds,
    observedAt: input.observedAt,
    kickoffAt: open.kickoffAt,
    rules: input.rules,
  });
  const record = await journal.recordClosing({
    analysisId: input.subject.kind === "analysis" ? input.subject.id : null,
    betId: input.subject.kind === "bet" ? input.subject.id : null,
    provenance: "observed",
    sportsbook: contract.sportsbook,
    market: contract.market,
    selection: contract.selection,
    pointLine: contract.pointLine,
    rules: contract.rules,
    americanOdds: contract.americanOdds,
    observedAt: input.observedAt,
    source: input.source.trim(),
  });
  return {
    id: record.id,
    subject: input.subject,
    provenance: "observed",
    sportsbook: contract.sportsbook,
    market: contract.market,
    selection: contract.selection,
    pointLine: contract.pointLine,
    rules: contract.rules,
    americanOdds: contract.americanOdds,
    observedAt: input.observedAt,
    source: input.source.trim(),
    comparison: compareClosing(
      { ...open, decimalOdds: americanToDecimal(open.americanOdds) },
      { ...contract, decimalOdds: contract.decimalOdds },
    ),
  };
}

async function openSide(
  journal: JournalRepository,
  boards: Pick<GameBoardStore, "getBoardForPick">,
  input: NewClosing,
) {
  if (input.subject.kind === "analysis") {
    const saved = await journal.findRun(input.subject.id);
    if (!saved) throw new Error(`Analysis not found: ${input.subject.id}`);
    return {
      gameId: saved.game.sourceGameId,
      kickoffAt: saved.game.kickoffAt,
      market: saved.offer.market,
      selection: saved.offer.selection,
      pointLine: saved.offer.pointLine,
      sportsbook: saved.offer.sportsbook,
      americanOdds: saved.offer.americanOdds,
      rules: saved.offer.rules,
    };
  }
  const bets = await journal.listBets();
  const bet = bets.find((item) => item.id === input.subject.id);
  if (!bet) throw new Error(`Bet not found: ${input.subject.id}`);
  if (!bet.contract) throw new Error("This bet has no recorded contract to compare.");
  const saved = bet.analysisId ? await journal.findRun(bet.analysisId) : null;
  if (bet.analysisId && !saved) throw new Error(`Analysis not found: ${bet.analysisId}`);
  const board =
    !bet.analysisId && bet.modelPickId ? await boards.getBoardForPick(bet.modelPickId) : null;
  if (!bet.analysisId && !board) throw new Error(`Model pick not found: ${bet.modelPickId}`);
  const game = saved
    ? { id: saved.game.sourceGameId, kickoff: saved.game.kickoffAt }
    : { id: board!.game.id, kickoff: board!.game.kickoff };
  return {
    gameId: game.id,
    kickoffAt: game.kickoff,
    market: bet.contract.market,
    selection: bet.contract.selection,
    pointLine: bet.contract.pointLine,
    sportsbook: bet.sportsbook ?? "",
    americanOdds: bet.americanOdds,
    rules: bet.contract.rules,
  };
}

function toClosing(
  record: Awaited<ReturnType<JournalRepository["listClosings"]>>[number],
  analyses: Map<string, ResearchRun | null>,
  bets: Map<string, Awaited<ReturnType<JournalRepository["listBets"]>>[number]>,
): ClosingObservation {
  const subject = record.analysisId
    ? { kind: "analysis" as const, id: record.analysisId }
    : { kind: "bet" as const, id: record.betId! };
  if (record.provenance === "archived-untimestamped" || record.observedAt === null) {
    return {
      id: record.id,
      subject,
      provenance: "archived-untimestamped",
      sportsbook: record.sportsbook,
      market: record.market,
      selection: record.selection,
      pointLine: record.pointLine,
      rules: record.rules,
      americanOdds: record.americanOdds,
      observedAt: null,
      source: record.source,
      comparison: { available: false, reason: "archived-untimestamped" },
    };
  }
  const openContract =
    subject.kind === "bet"
      ? (() => {
          const bet = bets.get(subject.id);
          return bet?.contract && bet.sportsbook
            ? {
                market: bet.contract.market,
                selection: bet.contract.selection,
                pointLine: bet.contract.pointLine,
                sportsbook: bet.sportsbook,
                rules: bet.contract.rules,
                americanOdds: bet.americanOdds,
              }
            : null;
        })()
      : (() => {
          const analysis = analyses.get(subject.id);
          return analysis
            ? {
                market: analysis.offer.market,
                selection: analysis.offer.selection,
                pointLine: analysis.offer.pointLine,
                sportsbook: analysis.offer.sportsbook,
                rules: analysis.offer.rules,
                americanOdds: analysis.offer.americanOdds,
              }
            : null;
        })();
  const comparison = openContract
    ? compareClosing(
        {
          ...openContract,
          decimalOdds: americanToDecimal(openContract.americanOdds),
        },
        {
          market: record.market,
          selection: record.selection,
          pointLine: record.pointLine,
          sportsbook: record.sportsbook,
          rules: record.rules,
          decimalOdds: record.decimalOdds,
        },
      )
    : { available: false as const, reason: "different-contract" as const };
  return {
    id: record.id,
    subject,
    provenance: "observed",
    sportsbook: record.sportsbook,
    market: record.market,
    selection: record.selection,
    pointLine: record.pointLine,
    rules: record.rules,
    americanOdds: record.americanOdds,
    observedAt: record.observedAt,
    source: record.source,
    comparison,
  };
}

async function recordNeonSettlement(
  journal: JournalRepository,
  boards: Pick<GameBoardStore, "getBoardForPick">,
  input: RecordSettlementInput,
): Promise<RecordSettlementResult> {
  const analysisId = input.analysisId || null;
  const betId = input.betId || null;
  if (analysisId) {
    const saved = await journal.findRun(analysisId);
    if (!saved) throw new Error(`Analysis not found: ${analysisId}`);
  }
  if (betId) {
    const bets = await journal.listBets();
    const bet = bets.find((item) => item.id === betId);
    if (!bet || (analysisId ? bet.analysisId !== analysisId : !bet.modelPickId)) {
      throw new Error(`Bet not found: ${betId}`);
    }
    if (!analysisId && bet.modelPickId) {
      const board = await boards.getBoardForPick(bet.modelPickId);
      if (!board) throw new Error(`Model pick not found: ${bet.modelPickId}`);
    }
  }
  if (!analysisId && !betId) throw new Error("Choose the analysis or the bet to settle");
  if (input.correctsNoticeId) {
    if (!input.reason?.trim())
      return { kind: "conflict", error: "A correction requires a reason." };
    const prior = await journal.readSettlementNotice(input.correctsNoticeId);
    const sameSubject = analysisId
      ? prior?.analysisId === analysisId
      : prior?.betId === betId && prior?.analysisId == null;
    if (!prior || !sameSubject) {
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
      analysisId,
      betId,
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
  boards: Pick<GameBoardStore, "getBoardForPick">,
  input: { analysisId?: string | null; betId?: string | null },
): Promise<{
  assessment: SettlementGrade | null;
  bet: SettlementGrade | null;
}> {
  const analysisId = input.analysisId || null;
  if (!analysisId) {
    const bets = await journal.listBets();
    const bet = bets.find((item) => item.id === input.betId);
    if (!bet?.contract || !bet.modelPickId || !bet.sportsbook) {
      throw new Error(`Bet not found: ${input.betId ?? ""}`);
    }
    const board = await boards.getBoardForPick(bet.modelPickId);
    if (!board) throw new Error(`Model pick not found: ${bet.modelPickId}`);
    const contract = parseOffer({
      gameId: board.game.id,
      sportsbook: bet.sportsbook,
      market: bet.contract.market,
      selection: bet.contract.selection,
      pointLine: bet.contract.pointLine ?? undefined,
      americanOdds: bet.americanOdds,
      observedAt: bet.placedAt,
      kickoffAt: board.game.kickoff,
      rules: bet.contract.rules,
    });
    const notices = (await journal.listSettlementNoticesForBet(bet.id)).map(
      (row): StoredNotice => ({
        ...row,
        analysisId: null,
        gameId: null,
        payloadKey: "",
      }),
    );
    return { assessment: null, bet: gradeFromNotices(contract, notices) };
  }
  const saved = await journal.findRun(analysisId);
  if (!saved) throw new Error(`Analysis not found: ${analysisId}`);
  const notices = (await journal.listSettlementNotices(analysisId)).map((row): StoredNotice => ({
    ...row,
    gameId: null,
    payloadKey: "",
  }));
  const assessment = gradeFromNotices(saved.offer, notices);
  if (!input.betId) return { assessment, bet: null };
  const bets = await journal.listBets();
  const bet = bets.find((item) => item.id === input.betId);
  if (!bet?.contract || bet.analysisId !== analysisId) return { assessment, bet: null };
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
