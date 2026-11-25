import { randomUUID } from "node:crypto";
import { CORRECTION_NOT_LATER, correctionIsLater } from "./board-store.ts";
import {
  validateClosingMarketSnapshot,
  validateProtocolRegistration,
  type ClosingMarketSnapshot,
  type ProtocolRegistration,
} from "../models/protocol.ts";
import { americanToDecimal } from "#lib/domain/odds.ts";
import { requireFinalScores, settleOffer, type Settlement } from "#lib/domain/settlement.ts";
import {
  parseOffer,
  type Offer,
  type OfferRules,
  type SideSelection,
  type Market,
} from "#lib/domain/offer.ts";
import { compareClosing, type ClosingComparison } from "./closing.ts";
import type { ProviderRequestRecord, ThesisReport } from "../providers/contracts.ts";
import type { RunModel } from "./model.ts";
import type { SavedForecast } from "./forecast-record.ts";
import type { PolicyDecision } from "./policy.ts";
import type { EvidenceItem } from "../sources/contracts.ts";
import type { AttemptRequest } from "./attempt.ts";
import {
  canonicalOrder,
  assertExplanationGraph,
  decodeJournalBackup,
  sameRecord,
  type AnalysisRecord,
  type BetContract,
  type BetRecord,
  type ClosingRecord,
  type EvidenceRecord,
  type GameRecord,
  type JournalExport,
  type OfferRecord,
  type ReportRecord,
  type RestorableJournal,
  type SettlementRecord,
  type UserResearchRecord,
} from "./journal-backup.ts";
import {
  betFingerprint,
  betFromRecord,
  closingSubject,
  closingSubjectColumns,
  evidenceRecord,
  gameRecord,
  instant,
  instantOrNull,
  mutableAnalysisColumns,
  pickBetOffer,
  recordsFromRun,
  reportRecord,
  roleColumns,
  runFromRecords,
  type AnalysisRecords,
} from "./journal-records.ts";
import { chooseAssessmentRole } from "./primary.ts";
import {
  createMemoryBoardStore,
  type GameBoard,
  type GameBoardStore,
  type OpenPick,
} from "./board-store.ts";

/**
 * Research store contract.
 *
 * The app uses the Neon store in `neon-store.ts`. The memory store exists for unit
 * tests and for Playwright, which opts in with POCKETCHECK_JOURNAL=memory.
 * Completed runs are immutable: a refresh saves a new id and leaves the parent
 * unchanged. The private lean is stored beside the run, never inside the packet.
 */

export type ProgressStage =
  | "checking inputs"
  | "collecting evidence"
  | "computing"
  | "drafting"
  | "checking report";

export const progressStages: ProgressStage[] = [
  "checking inputs",
  "collecting evidence",
  "computing",
  "drafting",
  "checking report",
];

export type RunUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  /** US dollars, as the provider reported it. Null when cost is unknown, never an invented zero. */
  costUsd: number | null;
  /** True when any included request left a token or cost field unreported. */
  partial: boolean;
};

export type { ProviderRequestRecord };

export type RunStatus = "pending" | "running" | "completed" | "interrupted" | "failed";

export type PrivateLean = {
  text: string;
  rationale: string;
};

export type SnapshotProvenance = "captured" | "legacy-unknown";

/** The game as it stood when the run was saved. */
export type RunGame = {
  id: string;
  season: number;
  week: number | null;
  home: string;
  away: string;
  kickoff: string;
  venue: string | null;
};

export type ResearchRun = {
  id: string;
  request: AttemptRequest | null;
  parentId: string | null;
  snapshotVersion: 1;
  snapshotProvenance: SnapshotProvenance;
  /** Decision cutoff: evidence after this instant was excluded. */
  cutoffAt: string;
  status: RunStatus;
  stages: ProgressStage[];
  game: RunGame;
  offer: Offer;
  lean: PrivateLean | null;
  evidence: EvidenceItem[];
  evidencePacketHash: string;
  /** Missing evidence and caveats found while collecting, owned by the app, not the drafter. */
  gaps: string[];
  /** Combined usage across every known provider request. Null when none was reported. */
  usage: RunUsage | null;
  /** Durable provider exchanges. Empty for runs saved before response recovery. */
  providerRequests: ProviderRequestRecord[];
  /** True when a sent request has no durable completion and must not be retried automatically. */
  providerOutcomeAmbiguous: boolean;
  report: ThesisReport | null;
  renderedText: string;
  failureReason: string | null;
  policy: PolicyDecision | null;
  /** The probability model this run froze. Null for runs saved before models were wired in. */
  probabilityModel: RunModel | null;
  /**
   * Decision-time forecast inputs. Null marks a legacy run whose input provenance was not captured.
   */
  forecast: SavedForecast | null;
  provider: string;
  model: string;
  createdAt: string;
  /** Set when the attempt first reaches a terminal status. Null while pending or running. */
  completedAt: string | null;
  /**
   * Frozen when the attempt reaches a terminal status. Null until then, and
   * null for historical rows that were never classified at completion.
   */
  assessmentRole: AssessmentRole | null;
};

export type NewRun = Omit<
  ResearchRun,
  "id" | "createdAt" | "completedAt" | "assessmentRole" | "snapshotVersion" | "snapshotProvenance"
> & {
  id?: string;
};

export type BeginAttemptResult =
  | { kind: "created"; run: ResearchRun }
  | { kind: "existing"; run: ResearchRun }
  | { kind: "conflict"; error: string };

/** One journal row. Listing never loads every full run. */
/** Frozen before outcomes are used. Legacy rows were not classified at completion. */
export type AssessmentRole =
  | { role: "primary"; reason: string }
  | { role: "refresh"; primaryId: string; reason: string }
  | { role: "ineligible"; reason: string }
  | { role: "unclassified"; reason: string };

export type RunSummary = {
  frozenForecast?: SavedForecast | null;
  frozenOffer?: Offer;
  id: string;
  parentId: string | null;
  snapshotProvenance: SnapshotProvenance;
  createdAt: string;
  conclusion: string;
  game: Pick<RunGame, "id" | "home" | "away" | "kickoff">;
  offer: Pick<Offer, "sportsbook" | "market" | "selection" | "pointLine" | "americanOdds">;
  reliesOnManualEvidence: boolean;
  /** Null only while a store has not yet attached a role. The journal always fills it. */
  assessmentRole: AssessmentRole;
};

export function summarize(run: ResearchRun): Omit<RunSummary, "assessmentRole"> {
  return {
    frozenForecast: run.forecast,
    frozenOffer: run.offer,
    id: run.id,
    parentId: run.parentId,
    snapshotProvenance: run.snapshotProvenance,
    createdAt: run.createdAt,
    conclusion: run.policy?.conclusion ?? run.report?.conclusion ?? "unknown",
    game: {
      id: run.game.id,
      home: run.game.home,
      away: run.game.away,
      kickoff: run.game.kickoff,
    },
    offer: {
      sportsbook: run.offer.sportsbook,
      market: run.offer.market,
      selection: run.offer.selection,
      pointLine: run.offer.pointLine,
      americanOdds: run.offer.americanOdds,
    },
    reliesOnManualEvidence: run.policy?.reliesOnManualEvidence ?? false,
  };
}

export type ContractProvenance = "captured" | "legacy-unknown";

/**
 * The contract the bettor placed. `captured` stores that contract itself.
 * `legacy-unknown` means the journal only kept price, book, stake, and time,
 * so market, line, and rules must not be filled from the research offer.
 */
export type ActualBet = {
  id: string;
  /** The analysis this bet was placed against. Null for a bet placed from a model pick. */
  analysisId: string | null;
  /** The model pick this bet started from. Null for every bet that predates model picks. */
  modelPickId: string | null;
  submissionId: string | null;
  contractProvenance: ContractProvenance;
  sportsbook: string;
  market: Market | null;
  selection: SideSelection | null;
  pointLine: number | null;
  rules: Offer["rules"] | null;
  americanOdds: number;
  stakeUnits: number;
  placedAt: string;
};

/** A bet belongs to an analysis or starts from a model pick, never both. */
export type NewActualBet = {
  analysisId?: string;
  modelPickId?: string;
  submissionId: string;
  sportsbook: string;
  market: Market;
  selection: SideSelection;
  pointLine?: number;
  rules: OfferRules;
  americanOdds: number;
  stakeUnits: number;
  placedAt: string;
};

export type RecordBetResult =
  | { kind: "created"; bet: ActualBet }
  | { kind: "existing"; bet: ActualBet }
  | { kind: "conflict"; error: string };

export type ClosingSubject = {
  kind: "analysis" | "bet" | "model-pick";
  id: string;
};

export type ClosingProvenance = "observed" | "archived-untimestamped";

/**
 * A later look at a contract. `observed` was captured with a time and source.
 * `archived-untimestamped` is a historical price with no observation time.
 * It is not an executable offer and not a timestamped user observation.
 */
export type ClosingObservation = {
  id: string;
  subject: ClosingSubject;
  provenance: ClosingProvenance;
  sportsbook: string;
  market: Market;
  selection: SideSelection;
  pointLine: number | null;
  rules: Offer["rules"];
  americanOdds: number;
  observedAt: string | null;
  source: string;
  comparison: ClosingComparison;
};

export type NewClosing = {
  subject: ClosingSubject;
  sportsbook: string;
  market: Market;
  selection: SideSelection;
  pointLine?: number;
  rules: OfferRules;
  americanOdds: number;
  observedAt: string;
  source: string;
};

export type RecordClosingResult = {
  kind: "created";
  closing: ClosingObservation;
};

export type ArchivedClosing = {
  subject: ClosingSubject;
  sportsbook: string;
  market: Market;
  selection: SideSelection;
  pointLine?: number;
  americanOdds: number;
  source: string;
};

export type SettlementNoticeKind = "final" | "postponed" | "void" | "unresolved";

export type RecordSettlementInput = {
  eventId: string;
  /** The analysis being graded. Absent when the notice grades a bet placed from a model pick. */
  analysisId?: string | null;
  /** The actual bet being graded. Required when there is no analysis. */
  betId?: string | null;
  kind: SettlementNoticeKind;
  homeScore?: number | null;
  awayScore?: number | null;
  recordedAt: string;
  source: string;
  reason?: string | null;
  correctsNoticeId?: string | null;
};

export type SettlementGrade = {
  result: Settlement | "unresolved";
  effective: Settlement | "unresolved";
  history: Array<{
    id: string;
    eventId: string;
    result: Settlement | "unresolved";
    reason: string | null;
    correctsId: string | null;
    recordedAt: string;
  }>;
};

export type RecordSettlementResult =
  | { kind: "recorded"; noticeId: string }
  | { kind: "duplicate"; noticeId: string }
  | { kind: "conflict"; error: string };

export type StoredNotice = {
  id: string;
  eventId: string;
  /** Exactly one of analysisId and gameId is set. Game notices belong to every board of the game. */
  analysisId: string | null;
  gameId: string | null;
  betId: string | null;
  kind: SettlementNoticeKind;
  homeScore: number | null;
  awayScore: number | null;
  source: string;
  reason: string | null;
  correctsId: string | null;
  recordedAt: string;
  payloadKey: string;
};

export type ResearchStore = {
  recordProtocolRegistration: (
    input: Omit<ProtocolRegistration, "registeredAt">,
  ) => Promise<ProtocolRegistration>;
  listProtocolRegistrations: () => Promise<ProtocolRegistration[]>;
  recordClosingMarketSnapshot: (
    input: Omit<ClosingMarketSnapshot, "recordedAt">,
  ) => Promise<ClosingMarketSnapshot>;
  listClosingMarketSnapshots: () => Promise<ClosingMarketSnapshot[]>;
  beginAttempt: (run: NewRun) => Promise<BeginAttemptResult>;
  updateAttempt: (run: NewRun) => Promise<ResearchRun>;
  saveRun: (run: NewRun) => Promise<ResearchRun>;
  getRun: (id: string) => Promise<ResearchRun | null>;
  /** Newest first. */
  listCompleted: () => Promise<RunSummary[]>;
  markInterrupted: (id: string) => Promise<ResearchRun | null>;
  recordBet: (bet: NewActualBet) => Promise<RecordBetResult>;
  listBets: () => Promise<ActualBet[]>;
  recordClosing: (closing: NewClosing) => Promise<RecordClosingResult>;
  /** Oldest first. Earlier observations stay when a later one is recorded. */
  listClosings: () => Promise<ClosingObservation[]>;
  recordSettlement: (input: RecordSettlementInput) => Promise<RecordSettlementResult>;
  readSettlement: (input: { analysisId?: string | null; betId?: string | null }) => Promise<{
    assessment: SettlementGrade | null;
    bet: SettlementGrade | null;
  }>;
  /** One bulk read of every settlement grade, for pages that would otherwise re-read per subject. */
  listSettlementGrades: () => Promise<{
    byAnalysis: Map<string, SettlementGrade>;
    byBet: Map<string, SettlementGrade>;
  }>;
  /** Test seam: a completed row whose role was never frozen at completion. */
  recordUnclassifiedCompleted?: (run: ResearchRun) => Promise<void>;
  /** Test seam: an archived price with no observation time. */
  recordArchivedClosing?: (closing: ArchivedClosing) => Promise<ClosingObservation>;
  /** Version 1 journal backup. Credentials and bulk caches are not included. */
  exportJournal: () => Promise<JournalExport>;
  /**
   * Restore a version 1 backup file, including a recognized older memory layout. The whole file
   * is decoded and checked first. Identical records are kept once. A bad backup or a conflicting
   * identifier changes nothing. Pending attempts stay records and are not sent to a source or
   * provider.
   */
  restoreJournal: (backup: unknown) => Promise<JournalExport>;
};

/** The whole journal: research analyses, actual bets, and game boards. */
export type JournalStore = ResearchStore & GameBoardStore;

/** The memory journal's records: the same version 1 records the Neon journal stores. */
type MemoryRecords = {
  games: Map<string, GameRecord>;
  offers: Map<string, OfferRecord>;
  evidence: Map<string, EvidenceRecord>;
  analyses: Map<string, AnalysisRecord>;
  reports: Map<string, ReportRecord>;
  userResearch: Map<string, UserResearchRecord>;
  bets: Map<string, BetRecord>;
  settlements: Map<string, SettlementRecord>;
  closings: Map<string, ClosingRecord>;
};

const RECORD_MAPS = [
  "games",
  "offers",
  "evidence",
  "analyses",
  "reports",
  "userResearch",
  "bets",
  "settlements",
  "closings",
] as const satisfies (keyof MemoryRecords)[];

function emptyRecords(): MemoryRecords {
  return Object.fromEntries(RECORD_MAPS.map((key) => [key, new Map()])) as MemoryRecords;
}

/** What the memory journal's free functions read: its records and derived views. */
type MemoryState = {
  records: MemoryRecords;
  notices: StoredNotice[];
  run: (id: string) => ResearchRun | null;
  pickBoard: (pickId: string) => GameBoard | null;
  pickOpen?: (pickId: string) => OpenPick | null;
};

export function createMemoryStore(options: { now?: () => string } = {}): JournalStore {
  const now = options.now ?? (() => new Date().toISOString());
  const records = emptyRecords();
  const notices: StoredNotice[] = [];
  const registrations: ProtocolRegistration[] = [];
  const marketSnapshots: ClosingMarketSnapshot[] = [];
  const boardStore = createMemoryBoardStore(notices, registrations, { now });
  let betWrites: Promise<unknown> = Promise.resolve();

  function analysisRecords(analysis: AnalysisRecord): AnalysisRecords {
    return {
      analysis,
      evidence: analysis.evidenceIds.map((id) => records.evidence.get(id)!),
      report: [...records.reports.values()].find((row) => row.analysisId === analysis.id) ?? null,
      userResearch:
        [...records.userResearch.values()].find((row) => row.analysisId === analysis.id) ?? null,
    };
  }

  function runOf(id: string): ResearchRun | null {
    const analysis = records.analyses.get(id);
    return analysis ? structuredClone(runFromRecords(analysisRecords(analysis))) : null;
  }

  function allRuns(): ResearchRun[] {
    return [...records.analyses.values()].map((analysis) =>
      runFromRecords(analysisRecords(analysis)),
    );
  }

  function pickBoard(pickId: string): GameBoard | null {
    for (const board of boardStore.boards.values()) {
      if (board.markets.some((market) => market.pick?.id === pickId)) return board;
    }
    return null;
  }

  const state: MemoryState = {
    records,
    notices,
    run: runOf,
    pickBoard,
    pickOpen: (pickId) => boardStore.pickContract(pickId),
  };

  /** The game's record identifier, created once from the first record that names the game. */
  function gameIdFor(game: RunGame): string {
    for (const record of records.games.values()) {
      if (record.sourceGameId === game.id) return record.id;
    }
    const record = gameRecord(randomUUID(), game);
    records.games.set(record.id, record);
    return record.id;
  }

  /** Runs without an awaited step, so the primary it reads is the game's frozen primary. */
  function freezeRole(saved: ResearchRun): AssessmentRole {
    const primary = allRuns().find(
      (run) =>
        run.game.id === saved.game.id &&
        run.id !== saved.id &&
        run.assessmentRole?.role === "primary",
    );
    return chooseAssessmentRole({
      status:
        saved.status === "completed" || saved.status === "failed" ? saved.status : "interrupted",
      cutoffAt: saved.cutoffAt,
      kickoffAt: saved.game.kickoff,
      parentId: saved.parentId,
      primaryId: primary?.id ?? null,
    });
  }

  /** A later save of an unfinished attempt. The snapshot, game, offer, and lean stay as begun. */
  function saveProgress(existing: AnalysisRecord, run: ResearchRun): void {
    const finished = run.status === "completed" ? instantOrNull(run.completedAt) : null;
    let evidenceIds = existing.evidenceIds;
    if (evidenceIds.length === 0) {
      evidenceIds = run.evidence.map((item) => {
        const saved = evidenceRecord(item, randomUUID(), finished);
        records.evidence.set(saved.id, saved);
        return saved.id;
      });
    }
    if (finished) {
      for (const id of evidenceIds) {
        const item = records.evidence.get(id)!;
        if (item.completedAt === null) records.evidence.set(id, { ...item, completedAt: finished });
      }
      const offer = records.offers.get(existing.offerId)!;
      if (offer.completedAt === null) {
        records.offers.set(offer.id, { ...offer, completedAt: finished });
      }
      const hasReport = [...records.reports.values()].some((row) => row.analysisId === run.id);
      if (run.report && !hasReport) {
        const report = reportRecord(randomUUID(), run.id, run.report, run.renderedText, finished);
        records.reports.set(report.id, report);
      }
    }
    records.analyses.set(existing.id, {
      ...existing,
      ...mutableAnalysisColumns(run),
      completedAt: instantOrNull(run.completedAt),
      ...roleColumns(run.assessmentRole),
      evidenceIds,
      snapshot: {
        ...existing.snapshot,
        providerRequests: run.providerRequests,
        providerOutcomeAmbiguous: run.providerOutcomeAmbiguous,
        ...(run.forecast ? { forecast: run.forecast } : {}),
      },
    });
  }

  function exportState(): JournalExport {
    return canonicalOrder(
      structuredClone({
        version: 1,
        ...(Object.fromEntries(RECORD_MAPS.map((key) => [key, [...records[key].values()]])) as {
          [Key in keyof MemoryRecords]: JournalExport[Key];
        }),
        settlementNotices: notices
          .filter((notice) => notice.gameId === null)
          .map(({ gameId: _gameId, ...notice }) => notice),
        gameBoards: [...boardStore.boards.values()],
        explanationEvents: [...boardStore.explanationEvents.values()],
        protocolRegistrations: registrations,
        closingMarketSnapshots: marketSnapshots,
        gameSettlementNotices: notices.filter((notice) => notice.gameId !== null),
      }),
    );
  }

  const research: ResearchStore = {
    async recordProtocolRegistration(input) {
      const prior = registrations.find((row) => row.id === input.id);
      if (prior) {
        const comparable = { ...prior, registeredAt: undefined };
        if (JSON.stringify(comparable) !== JSON.stringify({ ...input, registeredAt: undefined }))
          throw new Error(`Conflicting protocol registration identifier ${input.id}.`);
        return structuredClone(prior);
      }
      const registeredAt = now();
      const saved = { ...input, registeredAt };
      validateProtocolRegistration(saved);
      registrations.push(structuredClone(saved));
      return structuredClone(saved);
    },
    async listProtocolRegistrations() {
      return structuredClone(registrations);
    },
    async recordClosingMarketSnapshot(input) {
      if (
        !allRuns().some((run) => run.game.id === input.gameId) &&
        ![...boardStore.boards.values()].some((board) => board.game.id === input.gameId)
      )
        throw new Error(`Game not found: ${input.gameId}`);
      const prior = marketSnapshots.find((row) => row.id === input.id);
      if (prior) {
        const { recordedAt: _recordedAt, ...original } = prior;
        if (JSON.stringify(original) !== JSON.stringify(input))
          throw new Error(`Conflicting closing market snapshot identifier ${input.id}.`);
        return structuredClone(prior);
      }
      const saved = { ...input, recordedAt: now() };
      validateClosingMarketSnapshot(saved);
      marketSnapshots.push(structuredClone(saved));
      return structuredClone(saved);
    },
    async listClosingMarketSnapshots() {
      return structuredClone(marketSnapshots);
    },
    async beginAttempt(input) {
      const requestId = input.request?.id;
      const requestHash = input.request?.hash;
      if (!requestId || !requestHash) {
        return {
          kind: "conflict",
          error: "An attempt requires a request identifier and input hash.",
        };
      }
      const existing = [...records.analyses.values()].find(
        (row) => row.idempotencyKey === requestId,
      );
      if (existing) {
        if (existing.snapshot.request?.hash !== requestHash) {
          return {
            kind: "conflict",
            error: "This request identifier was already used with different inputs.",
          };
        }
        return { kind: "existing", run: runOf(existing.id)! };
      }
      const id = input.id ?? randomUUID();
      const createdAt = new Date().toISOString();
      const terminal =
        input.status === "completed" || input.status === "failed" || input.status === "interrupted";
      const draft: ResearchRun = structuredClone({
        ...input,
        id,
        snapshotVersion: 1,
        snapshotProvenance: "captured",
        forecast: input.forecast ?? null,
        createdAt,
        completedAt: terminal ? createdAt : null,
        assessmentRole: null,
      });
      draft.assessmentRole = terminal ? freezeRole(draft) : null;
      const graph = recordsFromRun(draft, {
        game: gameIdFor(draft.game),
        offer: randomUUID(),
        evidence: () => randomUUID(),
        report: randomUUID(),
        userResearch: randomUUID(),
      });
      records.games.set(graph.game.id, graph.game);
      records.offers.set(graph.offer.id, graph.offer);
      for (const item of graph.evidence) records.evidence.set(item.id, item);
      records.analyses.set(graph.analysis.id, graph.analysis);
      if (graph.report) records.reports.set(graph.report.id, graph.report);
      if (graph.userResearch) records.userResearch.set(graph.userResearch.id, graph.userResearch);
      return { kind: "created", run: runOf(id)! };
    },
    async updateAttempt(input) {
      if (!input.id) throw new Error("An attempt update requires an analysis id.");
      const existing = records.analyses.get(input.id);
      if (!existing) throw new Error(`Analysis not found: ${input.id}`);
      const saved = runOf(input.id)!;
      if (existing.status === "completed") return saved;
      if (saved.request?.id !== input.request?.id || saved.request?.hash !== input.request?.hash) {
        throw new Error("An attempt update cannot change its request identity or inputs.");
      }
      const terminal =
        input.status === "completed" || input.status === "failed" || input.status === "interrupted";
      const completedAt = saved.completedAt ?? (terminal ? new Date().toISOString() : null);
      const updated: ResearchRun = structuredClone({
        ...input,
        id: input.id,
        forecast: input.forecast === undefined ? saved.forecast : input.forecast,
        createdAt: saved.createdAt,
        completedAt,
        snapshotVersion: saved.snapshotVersion,
        snapshotProvenance: saved.snapshotProvenance,
        assessmentRole: saved.assessmentRole,
      });
      if (terminal && !updated.assessmentRole) updated.assessmentRole = freezeRole(updated);
      saveProgress(existing, updated);
      return runOf(input.id)!;
    },
    async saveRun(input) {
      return this.updateAttempt(input);
    },
    async getRun(id) {
      return runOf(id);
    },
    async listCompleted() {
      return allRuns()
        .filter((run) => run.status === "completed")
        .reverse()
        .map((run) => ({
          ...summarize(run),
          assessmentRole: run.assessmentRole ?? {
            role: "unclassified" as const,
            reason:
              "Completion time was not recorded, so this analysis was not classified before outcomes.",
          },
        }));
    },
    async markInterrupted(id) {
      const existing = records.analyses.get(id);
      const run = runOf(id);
      if (!existing || !run || run.status === "completed") return run;
      const interrupted: ResearchRun = {
        ...run,
        status: "interrupted",
        completedAt: run.completedAt ?? new Date().toISOString(),
      };
      if (!interrupted.assessmentRole) interrupted.assessmentRole = freezeRole(interrupted);
      records.analyses.set(id, {
        ...existing,
        status: "interrupted",
        completedAt: instantOrNull(interrupted.completedAt),
        ...roleColumns(interrupted.assessmentRole),
      });
      return runOf(id);
    },
    async recordBet(bet) {
      const write = betWrites.then(() => recordMemoryBet(state, bet, gameIdFor));
      betWrites = write.then(
        () => undefined,
        () => undefined,
      );
      return write;
    },
    async listBets() {
      return [...records.bets.values()]
        .filter((record) => record.analysisId !== null || record.modelPickId)
        .map(betFromRecord);
    },
    async recordClosing(input) {
      return { kind: "created", closing: recordMemoryClosing(state, input) };
    },
    async listClosings() {
      return [...records.closings.values()].map((record) => {
        const saved = closingObservation(record, {
          available: false,
          reason: "archived-untimestamped",
        });
        if (saved.provenance === "archived-untimestamped") return saved;
        try {
          const open = openSide(state, saved.subject);
          saved.comparison = compareClosing(
            { ...open, decimalOdds: americanToDecimal(open.americanOdds) },
            { ...saved, decimalOdds: record.decimalOdds },
            { entryAt: open.observedAt, observedAt: saved.observedAt, kickoffAt: open.kickoffAt },
          );
        } catch {
          saved.comparison = { available: false, reason: "missing-entry-time" };
        }
        return saved;
      });
    },
    async recordSettlement(input) {
      requireFinalScores(input);
      const write = betWrites.then(() => recordMemorySettlement(state, input));
      betWrites = write.then(
        () => undefined,
        () => undefined,
      );
      return write;
    },
    async readSettlement(input) {
      return readMemorySettlement(state, input);
    },
    async listSettlementGrades() {
      const byAnalysis = new Map<string, SettlementGrade>();
      for (const id of records.analyses.keys()) {
        byAnalysis.set(id, (await readMemorySettlement(state, { analysisId: id })).assessment!);
      }
      const byBet = new Map<string, SettlementGrade>();
      for (const [id, bet] of records.bets) {
        const input = bet.analysisId ? { analysisId: bet.analysisId, betId: id } : { betId: id };
        byBet.set(id, (await readMemorySettlement(state, input)).bet!);
      }
      return { byAnalysis, byBet };
    },
    async recordUnclassifiedCompleted(run) {
      const existing = records.analyses.get(run.id);
      if (!existing) throw new Error(`Analysis not found: ${run.id}`);
      records.analyses.set(run.id, { ...existing, ...roleColumns(null) });
    },
    async recordArchivedClosing(input) {
      return recordMemoryClosing(
        state,
        {
          ...input,
          rules: { period: "full-game", overtime: "included" },
          observedAt: "",
          source: input.source,
        },
        "archived-untimestamped",
      );
    },
    async exportJournal() {
      return exportState();
    },
    async restoreJournal(input) {
      const backup = decodeJournalBackup(input);
      const staged = stageRestore(
        {
          records,
          notices,
          registrations,
          marketSnapshots,
          boards: boardStore.boards,
          explanationEvents: boardStore.explanationEvents,
        },
        backup,
      );
      // Everything was checked against copies. Replacing the live lists cannot fail part way.
      for (const key of RECORD_MAPS) {
        replaceMap(
          records[key] as Map<string, unknown>,
          staged.records[key] as Map<string, unknown>,
        );
      }
      replaceMap(boardStore.boards, staged.boards);
      replaceMap(boardStore.explanationEvents, staged.explanationEvents);
      boardStore.submissions.clear();
      for (const board of staged.boards.values()) {
        boardStore.submissions.set(board.request.id, board.id);
      }
      notices.splice(0, notices.length, ...staged.notices);
      registrations.splice(0, registrations.length, ...staged.registrations);
      marketSnapshots.splice(0, marketSnapshots.length, ...staged.marketSnapshots);
      return exportState();
    },
  };
  return { ...research, ...boardStore };
}

function replaceMap<K, V>(live: Map<K, V>, next: Map<K, V>): void {
  live.clear();
  for (const [key, value] of next) live.set(key, value);
}

type MemoryJournalState = {
  records: MemoryRecords;
  notices: StoredNotice[];
  registrations: ProtocolRegistration[];
  marketSnapshots: ClosingMarketSnapshot[];
  boards: Map<string, GameBoard>;
  explanationEvents: Map<string, import("./board-explanation.ts").ExplanationEvent>;
};

function conflict(label: string, id: string): never {
  throw new Error(`Conflicting ${label} identifier ${id} does not match the saved record.`);
}

/**
 * The journal after a decoded backup is merged into copies of the current records. Identical
 * records are kept once. A conflicting identifier, or a record that would break a uniqueness
 * rule the Neon journal enforces, throws before anything live changes.
 */
function stageRestore(live: MemoryJournalState, backup: RestorableJournal): MemoryJournalState {
  const records = Object.fromEntries(
    RECORD_MAPS.map((key) => [
      key,
      new Map(structuredClone([...(live.records[key] as Map<string, unknown>)])),
    ]),
  ) as unknown as MemoryRecords;
  const boards = new Map(structuredClone([...live.boards]));
  const explanationEvents = new Map(structuredClone([...live.explanationEvents]));
  const notices = structuredClone(live.notices);
  const registrations = structuredClone(live.registrations);
  const marketSnapshots = structuredClone(live.marketSnapshots);

  const merge = <T extends { id: string }>(
    target: Map<string, T>,
    rows: T[],
    label: string,
    uniqueKey?: (row: T) => string | null,
  ) => {
    for (const row of rows) {
      const stored = target.get(row.id);
      if (stored) {
        if (!sameRecord(stored, row)) conflict(label, row.id);
        continue;
      }
      const key = uniqueKey?.(row);
      if (key != null && [...target.values()].some((other) => uniqueKey!(other) === key)) {
        conflict(label, row.id);
      }
      target.set(row.id, structuredClone(row));
    }
  };
  const mergeList = <T extends { id: string }>(
    target: T[],
    rows: T[],
    label: string,
    matches: (stored: T, row: T) => boolean = (stored, row) => stored.id === row.id,
  ) => {
    for (const row of rows) {
      const stored = target.find((item) => matches(item, row));
      if (stored) {
        if (stored.id !== row.id || !sameRecord(stored, row)) conflict(label, row.id);
        continue;
      }
      target.push(structuredClone(row));
    }
  };

  mergeList(registrations, backup.protocolRegistrations ?? [], "protocol registration");
  const gameIds = new Map<string, string>();
  for (const game of backup.games) {
    const stored =
      records.games.get(game.id) ??
      [...records.games.values()].find((row) => row.sourceGameId === game.sourceGameId);
    if (stored) {
      if (!sameRecord({ ...stored, id: game.id }, game)) conflict("game", game.id);
      gameIds.set(game.id, stored.id);
      continue;
    }
    records.games.set(game.id, structuredClone(game));
    gameIds.set(game.id, game.id);
  }
  merge(
    records.offers,
    backup.offers.map((offer) => ({ ...offer, gameId: gameIds.get(offer.gameId) ?? offer.gameId })),
    "offer",
  );
  merge(records.evidence, backup.evidence, "evidence");
  merge(records.analyses, backup.analyses, "analysis", (row) => row.idempotencyKey);
  merge(records.reports, backup.reports, "report", (row) => row.analysisId);
  merge(records.userResearch, backup.userResearch, "user research", (row) => row.analysisId);
  merge(boards, backup.gameBoards ?? [], "game board", (row) => row.request.id);
  merge(
    explanationEvents,
    backup.explanationEvents ?? [],
    "explanation event",
    (row) => `${row.boardId}/${row.sequence}`,
  );
  merge(records.bets, backup.bets, "bet", (row) => row.submissionId);
  merge(records.settlements, backup.settlements, "settlement");
  merge(records.closings, backup.closings, "closing observation");
  const sameEvent = (stored: StoredNotice, row: StoredNotice) =>
    stored.id === row.id || stored.eventId === row.eventId;
  mergeList(
    notices,
    (backup.settlementNotices ?? []).map((notice) => ({ ...notice, gameId: null })),
    "settlement notice",
    sameEvent,
  );
  mergeList(notices, backup.gameSettlementNotices ?? [], "game settlement notice", sameEvent);
  mergeList(marketSnapshots, backup.closingMarketSnapshots ?? [], "closing market snapshot");

  const primaries = new Map<string, string>();
  for (const analysis of records.analyses.values()) {
    if (analysis.assessmentRole !== "primary") continue;
    const game = analysis.snapshot.game.sourceGameId;
    if (primaries.has(game)) conflict("primary assessment", analysis.id);
    primaries.set(game, analysis.id);
  }
  const primaryPicks = new Set<string>();
  for (const board of boards.values()) {
    for (const market of board.markets) {
      if (market.pick?.role.role !== "primary") continue;
      const key = `${board.game.id}/${market.market}`;
      if (primaryPicks.has(key)) conflict("primary model pick", market.pick.id);
      primaryPicks.add(key);
    }
  }
  assertExplanationGraph([...boards.values()], [...explanationEvents.values()]);
  return { records, notices, registrations, marketSnapshots, boards, explanationEvents };
}

function recordMemoryBet(
  state: MemoryState,
  input: NewActualBet,
  gameIdFor: (game: RunGame) => string,
): RecordBetResult {
  if (!input.analysisId === !input.modelPickId) {
    throw new Error("An actual bet belongs to one analysis or one model pick.");
  }
  let game: RunGame;
  let offerId: string | null = null;
  if (input.modelPickId) {
    const board = state.pickBoard(input.modelPickId);
    if (!board) throw new Error(`Model pick not found: ${input.modelPickId}`);
    game = board.game;
  } else {
    const analysis = state.records.analyses.get(input.analysisId!);
    if (!analysis) throw new Error(`Analysis not found: ${input.analysisId}`);
    game = state.run(analysis.id)!.game;
    offerId = analysis.offerId;
  }
  if (!input.submissionId) throw new Error("An actual bet requires a submission identifier.");
  if (!Number.isFinite(input.stakeUnits) || input.stakeUnits <= 0) {
    throw new Error("Stake must be a positive number of units");
  }
  const contract = parseOffer({
    gameId: game.id,
    sportsbook: input.sportsbook,
    market: input.market,
    selection: input.selection,
    pointLine: input.pointLine,
    americanOdds: input.americanOdds,
    observedAt: input.placedAt,
    kickoffAt: game.kickoff,
    rules: input.rules,
  });
  const fingerprint = betFingerprint(
    input.analysisId,
    input.modelPickId,
    contract,
    input.stakeUnits,
    input.placedAt,
  );
  const existing = [...state.records.bets.values()].find(
    (item) => item.submissionId === input.submissionId,
  );
  if (existing) {
    if (existing.contractFingerprint !== fingerprint) {
      return {
        kind: "conflict",
        error: "This submission identifier was already used with different inputs.",
      };
    }
    return { kind: "existing", bet: betFromRecord(structuredClone(existing)) };
  }
  const placed: BetContract = {
    market: contract.market,
    selection: contract.selection,
    pointLine: contract.pointLine,
    rules: contract.rules,
  };
  if (!offerId) {
    const offer = pickBetOffer({
      id: randomUUID(),
      gameId: gameIdFor(game),
      kickoffAt: game.kickoff,
      sportsbook: contract.sportsbook,
      contract: placed,
      americanOdds: contract.americanOdds,
      placedAt: input.placedAt,
    });
    state.records.offers.set(offer.id, offer);
    offerId = offer.id;
  }
  const saved: BetRecord = {
    id: randomUUID(),
    offerId,
    analysisId: input.analysisId ?? null,
    modelPickId: input.modelPickId ?? null,
    submissionId: input.submissionId,
    contract: placed,
    contractFingerprint: fingerprint,
    americanOdds: contract.americanOdds,
    decimalOdds: americanToDecimal(contract.americanOdds),
    placedAt: instant(input.placedAt),
    stakeUnits: input.stakeUnits,
    sportsbook: contract.sportsbook,
  };
  state.records.bets.set(saved.id, saved);
  return { kind: "created", bet: betFromRecord(structuredClone(saved)) };
}

/** The game of a bet: its analysis's game, or the game of the board its model pick is on. */
function betGame(state: MemoryState, bet: BetRecord): RunGame | null {
  if (bet.analysisId) return state.run(bet.analysisId)?.game ?? null;
  return bet.modelPickId ? (state.pickBoard(bet.modelPickId)?.game ?? null) : null;
}

type OpenSide = {
  observedAt: string | null;
  gameId: string;
  kickoffAt: string;
  market: Market;
  selection: SideSelection;
  pointLine: number | null;
  sportsbook: string;
  americanOdds: number;
  rules: Offer["rules"];
};

function openSide(state: MemoryState, subject: ClosingSubject): OpenSide {
  if (subject.kind === "analysis") {
    const run = state.run(subject.id);
    if (!run) throw new Error(`Analysis not found: ${subject.id}`);
    return {
      gameId: run.game.id,
      observedAt: run.offer.observedAt ?? null,
      kickoffAt: run.game.kickoff,
      market: run.offer.market,
      selection: run.offer.selection,
      pointLine: run.offer.pointLine,
      sportsbook: run.offer.sportsbook,
      americanOdds: run.offer.americanOdds,
      rules: run.offer.rules,
    };
  }
  if (subject.kind === "model-pick") {
    const open = state.pickOpen?.(subject.id);
    if (!open) throw new Error(`Model pick not found: ${subject.id}`);
    return open;
  }
  const bet = state.records.bets.get(subject.id);
  if (!bet) throw new Error(`Bet not found: ${subject.id}`);
  if (!bet.contract) throw new Error("This bet has no recorded contract to compare.");
  const game = betGame(state, bet);
  if (!game) {
    throw new Error(
      bet.modelPickId
        ? `Model pick not found: ${bet.modelPickId}`
        : `Analysis not found: ${bet.analysisId}`,
    );
  }
  return {
    gameId: game.id,
    observedAt: bet.placedAt ?? null,
    kickoffAt: game.kickoff,
    market: bet.contract.market,
    selection: bet.contract.selection,
    pointLine: bet.contract.pointLine,
    sportsbook: bet.sportsbook ?? "",
    americanOdds: bet.americanOdds,
    rules: bet.contract.rules,
  };
}

function closingObservation(
  record: ClosingRecord,
  comparison: ClosingComparison,
): ClosingObservation {
  return {
    id: record.id,
    subject: closingSubject(record),
    provenance: record.provenance,
    sportsbook: record.sportsbook,
    market: record.market,
    selection: record.selection,
    pointLine: record.pointLine,
    rules: structuredClone(record.rules),
    americanOdds: record.americanOdds,
    observedAt: record.observedAt,
    source: record.source,
    comparison,
  };
}

function recordMemoryClosing(
  state: MemoryState,
  input: NewClosing,
  provenance: ClosingProvenance = "observed",
): ClosingObservation {
  if (!input.source.trim()) throw new Error("A closing observation requires a source.");
  const open = openSide(state, input.subject);
  if (provenance === "archived-untimestamped") {
    const record: ClosingRecord = {
      id: randomUUID(),
      ...closingSubjectColumns(input.subject),
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
      decimalOdds: americanToDecimal(input.americanOdds),
      observedAt: null,
      source: input.source.trim(),
    };
    state.records.closings.set(record.id, record);
    return closingObservation(record, { available: false, reason: "archived-untimestamped" });
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
  if (
    !open.observedAt ||
    !Number.isFinite(Date.parse(open.observedAt)) ||
    Date.parse(input.observedAt) <= Date.parse(open.observedAt)
  ) {
    throw new Error("A closing observation must be later than the entry time.");
  }
  const comparison = compareClosing(
    {
      market: open.market,
      selection: open.selection,
      pointLine: open.pointLine,
      sportsbook: open.sportsbook,
      rules: open.rules,
      decimalOdds: americanToDecimal(open.americanOdds),
    },
    {
      market: contract.market,
      selection: contract.selection,
      pointLine: contract.pointLine,
      sportsbook: contract.sportsbook,
      rules: contract.rules,
      decimalOdds: contract.decimalOdds,
    },
    { entryAt: open.observedAt, observedAt: input.observedAt, kickoffAt: open.kickoffAt },
  );
  const record: ClosingRecord = {
    id: randomUUID(),
    ...closingSubjectColumns(input.subject),
    provenance: "observed",
    sportsbook: contract.sportsbook,
    market: contract.market,
    selection: contract.selection,
    pointLine: contract.pointLine,
    rules: contract.rules,
    americanOdds: contract.americanOdds,
    decimalOdds: americanToDecimal(contract.americanOdds),
    observedAt: instant(input.observedAt),
    source: input.source.trim(),
  };
  state.records.closings.set(record.id, record);
  return { ...closingObservation(record, comparison), observedAt: input.observedAt };
}

export function settlementPayloadKey(input: RecordSettlementInput): string {
  return JSON.stringify({
    eventId: input.eventId,
    analysisId: input.analysisId,
    betId: input.betId ?? null,
    kind: input.kind,
    homeScore: input.homeScore ?? null,
    awayScore: input.awayScore ?? null,
    source: input.source,
    reason: input.reason ?? null,
    correctsNoticeId: input.correctsNoticeId ?? null,
  });
}

function recordMemorySettlement(
  state: MemoryState,
  input: RecordSettlementInput,
): RecordSettlementResult {
  const analysisId = input.analysisId || null;
  const betId = input.betId || null;
  if (analysisId && !state.records.analyses.has(analysisId)) {
    throw new Error(`Analysis not found: ${analysisId}`);
  }
  const bet = betId ? state.records.bets.get(betId) : undefined;
  if (betId && (!bet || (analysisId ? bet.analysisId !== analysisId : !bet.modelPickId))) {
    throw new Error(`Bet not found: ${betId}`);
  }
  if (!analysisId && !bet) throw new Error("Choose the analysis or the bet to settle");
  if (input.correctsNoticeId) {
    if (!input.reason?.trim()) {
      return { kind: "conflict", error: "A correction requires a reason." };
    }
    const prior = state.notices.find((item) => item.id === input.correctsNoticeId);
    const sameSubject = analysisId
      ? prior?.analysisId === analysisId
      : prior?.betId === betId && prior.analysisId === null;
    if (!prior || !sameSubject) {
      throw new Error(`Settlement not found: ${input.correctsNoticeId}`);
    }
    if (!correctionIsLater(prior, input.recordedAt)) {
      return { kind: "conflict", error: CORRECTION_NOT_LATER };
    }
  }
  const payloadKey = settlementPayloadKey(input);
  const sameEvent = state.notices.filter((item) => item.eventId === input.eventId);
  if (sameEvent.length > 0) {
    const match = sameEvent.find((item) => item.payloadKey === payloadKey);
    if (match) return { kind: "duplicate", noticeId: match.id };
    return {
      kind: "conflict",
      error: "This settlement event identifier was already used with different inputs.",
    };
  }
  const saved: StoredNotice = {
    id: randomUUID(),
    eventId: input.eventId,
    analysisId,
    gameId: null,
    betId,
    kind: input.kind,
    homeScore: input.homeScore ?? null,
    awayScore: input.awayScore ?? null,
    source: input.source,
    reason: input.reason ?? null,
    correctsId: input.correctsNoticeId ?? null,
    recordedAt: input.recordedAt,
    payloadKey,
  };
  state.notices.push(saved);
  return { kind: "recorded", noticeId: saved.id };
}

export function gradeFromNotices(offer: Offer, notices: StoredNotice[]): SettlementGrade {
  const ordered = [...notices].sort((left, right) =>
    left.recordedAt.localeCompare(right.recordedAt),
  );
  const history = ordered.map((notice) => ({
    id: notice.id,
    eventId: notice.eventId,
    result: gradeNotice(offer, notice),
    reason: notice.reason,
    correctsId: notice.correctsId,
    recordedAt: notice.recordedAt,
  }));
  const latest = history.at(-1);
  const effective = latest?.result ?? "unresolved";
  return { result: effective, effective, history };
}

function gradeNotice(offer: Offer, notice: StoredNotice): Settlement {
  if (notice.kind === "postponed" || notice.kind === "unresolved") return "unresolved";
  if (notice.kind === "void") return "void";
  return settleOffer(offer, {
    homeScore: notice.homeScore ?? Number.NaN,
    awayScore: notice.awayScore ?? Number.NaN,
    voided: false,
  });
}

function readMemorySettlement(
  state: MemoryState,
  input: { analysisId?: string | null; betId?: string | null },
): { assessment: SettlementGrade | null; bet: SettlementGrade | null } {
  const analysisId = input.analysisId || null;
  if (!analysisId) {
    const bet = input.betId ? state.records.bets.get(input.betId) : undefined;
    const game = bet ? betGame(state, bet) : null;
    if (!bet?.modelPickId || !bet.contract || !game) {
      throw new Error(`Bet not found: ${input.betId ?? ""}`);
    }
    const contract = placedOffer(bet, bet.contract, game);
    const notices = state.notices.filter(
      (item) => item.betId === bet.id && item.analysisId === null,
    );
    return { assessment: null, bet: gradeFromNotices(contract, notices) };
  }
  const run = state.run(analysisId);
  if (!run) throw new Error(`Analysis not found: ${analysisId}`);
  const forRun = state.notices.filter((item) => item.analysisId === analysisId);
  const assessment = gradeFromNotices(run.offer, forRun);
  if (!input.betId) return { assessment, bet: null };
  const bet = state.records.bets.get(input.betId);
  if (!bet || bet.analysisId !== analysisId || !bet.contract) {
    return { assessment, bet: null };
  }
  return { assessment, bet: gradeFromNotices(placedOffer(bet, bet.contract, run.game), forRun) };
}

function placedOffer(bet: BetRecord, contract: BetContract, game: RunGame): Offer {
  return parseOffer({
    gameId: game.id,
    sportsbook: bet.sportsbook ?? "",
    market: contract.market,
    selection: contract.selection,
    pointLine: contract.pointLine ?? undefined,
    americanOdds: bet.americanOdds,
    observedAt: bet.placedAt,
    kickoffAt: game.kickoff,
    rules: contract.rules,
  });
}
