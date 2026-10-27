import { createHash, randomUUID } from "node:crypto";
import { americanToDecimal } from "#lib/domain/odds.ts";
import { settleOffer, type Settlement } from "#lib/domain/settlement.ts";
import {
  parseOffer,
  type Offer,
  type OfferRules,
  type SideSelection,
  type Market,
} from "#lib/domain/offer.ts";
import { compareClosing, type ClosingComparison } from "./closing.ts";
import type {
  ProviderRequestRecord,
  ThesisReport,
} from "../providers/contracts.ts";
import type { RunModel } from "./model.ts";
import type { SavedForecast } from "./forecast-record.ts";
import type { PolicyDecision } from "./policy.ts";
import type { EvidenceItem } from "../sources/contracts.ts";
import type { AttemptRequest } from "./attempt.ts";
import type { JournalExport } from "../db/repository.ts";
import { assertRestorable } from "../db/repository.ts";
import { classifyPregameRuns, type PregameRun } from "./primary.ts";
import {
  createMemoryBoardStore,
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

export type RunStatus =
  "pending" | "running" | "completed" | "interrupted" | "failed";

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
  | "id"
  | "createdAt"
  | "completedAt"
  | "assessmentRole"
  | "snapshotVersion"
  | "snapshotProvenance"
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
  id: string;
  parentId: string | null;
  snapshotProvenance: SnapshotProvenance;
  createdAt: string;
  conclusion: string;
  game: Pick<RunGame, "id" | "home" | "away" | "kickoff">;
  offer: Pick<
    Offer,
    "sportsbook" | "market" | "selection" | "pointLine" | "americanOdds"
  >;
  reliesOnManualEvidence: boolean;
  /** Null only while a store has not yet attached a role. The journal always fills it. */
  assessmentRole: AssessmentRole;
};

export function summarize(
  run: ResearchRun,
): Omit<RunSummary, "assessmentRole"> {
  return {
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

const PRIMARY_REASON = "Earliest completed analysis before kickoff";
const REFRESH_REASON =
  "Later completed analysis. The primary assessment is unchanged.";
const AFTER_KICKOFF_REASON =
  "Decision cutoff is not before kickoff, so this analysis is not an eligible pregame assessment.";
const UNCLASSIFIED_REASON =
  "Completion time was not recorded, so this analysis was not classified before outcomes.";

export function assessmentRoleFor(
  run: Pick<
    ResearchRun,
    "id" | "status" | "cutoffAt" | "game" | "createdAt"
  > & {
    completedAt: string | null;
  },
  siblings: Array<
    Pick<ResearchRun, "id" | "status" | "cutoffAt" | "game" | "createdAt"> & {
      completedAt: string | null;
    }
  >,
): AssessmentRole {
  if (run.status === "completed" && run.completedAt === null) {
    return { role: "unclassified", reason: UNCLASSIFIED_REASON };
  }
  const pregame: PregameRun[] = siblings.map((item) => ({
    id: item.id,
    gameId: item.game.id,
    completedAt: item.status === "completed" ? item.completedAt : null,
    cutoffAt: item.cutoffAt,
    kickoffAt: item.game.kickoff,
    status: item.status === "interrupted" ? "interrupted" : item.status,
  }));
  const choice = classifyPregameRuns(pregame).find(
    (item) => item.id === run.id,
  );
  if (!choice || choice.role === "ineligible") {
    const reason =
      choice?.reason === "after-kickoff"
        ? AFTER_KICKOFF_REASON
        : "This analysis did not complete before kickoff.";
    return { role: "ineligible", reason };
  }
  if (choice.role === "primary")
    return { role: "primary", reason: PRIMARY_REASON };
  return {
    role: "refresh",
    primaryId: choice.primaryId,
    reason: REFRESH_REASON,
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

export type SettlementNoticeKind =
  "final" | "postponed" | "void" | "unresolved";

export type RecordSettlementInput = {
  eventId: string;
  analysisId: string;
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
  recordSettlement: (
    input: RecordSettlementInput,
  ) => Promise<RecordSettlementResult>;
  readSettlement: (input: {
    analysisId: string;
    betId?: string | null;
  }) => Promise<{ assessment: SettlementGrade; bet: SettlementGrade | null }>;
  /** Test seam: a completed row whose role was never frozen at completion. */
  recordUnclassifiedCompleted?: (run: ResearchRun) => Promise<void>;
  /** Test seam: an archived price with no observation time. */
  recordArchivedClosing?: (
    closing: ArchivedClosing,
  ) => Promise<ClosingObservation>;
  /** Version 1 journal backup. Credentials and bulk caches are not included. */
  exportJournal: () => Promise<JournalExport>;
  /**
   * Restore a validated backup. Identical records are kept once. A bad backup
   * or a conflicting identifier changes nothing. Pending attempts stay records
   * and are not sent to a source or provider.
   */
  restoreJournal: (backup: JournalExport) => Promise<JournalExport>;
};

/** The whole journal: research analyses, actual bets, and game boards. */
export type JournalStore = ResearchStore & GameBoardStore;

export function createMemoryStore(): JournalStore {
  const runs = new Map<string, ResearchRun>();
  const requests = new Map<string, string>();
  const bets: ActualBet[] = [];
  const closings: ClosingObservation[] = [];
  const notices: StoredNotice[] = [];
  const boardStore = createMemoryBoardStore(notices);
  const submissions = new Map<string, string>();
  const fingerprints = new Map<string, string>();
  let betWrites: Promise<unknown> = Promise.resolve();

  function freezeRole(saved: ResearchRun): AssessmentRole {
    const completedAt = saved.completedAt ?? saved.createdAt;
    const sameGame = [...runs.values()].filter(
      (run) => run.game.id === saved.game.id,
    );
    const existingPrimary = sameGame.find(
      (run) => run.assessmentRole?.role === "primary",
    );
    if (saved.status !== "completed" || completedAt === null) {
      return assessmentRoleFor({ ...saved, completedAt: null }, [
        { ...saved, completedAt: null },
      ]);
    }
    if (!(Date.parse(saved.cutoffAt) < Date.parse(saved.game.kickoff))) {
      return assessmentRoleFor({ ...saved, completedAt }, [
        { ...saved, completedAt },
      ]);
    }
    if (!existingPrimary || existingPrimary.id === saved.id) {
      return {
        role: "primary",
        reason: "Earliest completed analysis before kickoff",
      };
    }
    return {
      role: "refresh",
      primaryId: existingPrimary.id,
      reason: "Later completed analysis. The primary assessment is unchanged.",
    };
  }

  const research: ResearchStore = {
    async beginAttempt(input) {
      const requestId = input.request?.id;
      const requestHash = input.request?.hash;
      if (!requestId || !requestHash) {
        return {
          kind: "conflict",
          error: "An attempt requires a request identifier and input hash.",
        };
      }
      const existingId = requests.get(requestId);
      if (existingId) {
        const existing = runs.get(existingId);
        if (!existing)
          throw new Error(`Attempt index is inconsistent: ${requestId}`);
        if (existing.request?.hash !== requestHash) {
          return {
            kind: "conflict",
            error:
              "This request identifier was already used with different inputs.",
          };
        }
        return { kind: "existing", run: structuredClone(existing) };
      }
      const id = input.id ?? randomUUID();
      const createdAt = new Date().toISOString();
      const terminal =
        input.status === "completed" ||
        input.status === "failed" ||
        input.status === "interrupted";
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
      runs.set(id, draft);
      requests.set(requestId, id);
      return { kind: "created", run: structuredClone(draft) };
    },
    async updateAttempt(input) {
      if (!input.id)
        throw new Error("An attempt update requires an analysis id.");
      const existing = runs.get(input.id);
      if (!existing) throw new Error(`Analysis not found: ${input.id}`);
      if (existing.status === "completed") return structuredClone(existing);
      if (
        existing.request?.id !== input.request?.id ||
        existing.request?.hash !== input.request?.hash
      ) {
        throw new Error(
          "An attempt update cannot change its request identity or inputs.",
        );
      }
      const terminal =
        input.status === "completed" ||
        input.status === "failed" ||
        input.status === "interrupted";
      const completedAt =
        existing.completedAt ?? (terminal ? new Date().toISOString() : null);
      const updated: ResearchRun = structuredClone({
        ...input,
        id: input.id,
        forecast:
          input.forecast === undefined ? existing.forecast : input.forecast,
        createdAt: existing.createdAt,
        completedAt,
        snapshotVersion: existing.snapshotVersion,
        snapshotProvenance: existing.snapshotProvenance,
        assessmentRole: existing.assessmentRole,
      });
      if (terminal && !updated.assessmentRole)
        updated.assessmentRole = freezeRole(updated);
      runs.set(updated.id, updated);
      return structuredClone(updated);
    },
    async saveRun(input) {
      return this.updateAttempt(input);
    },
    async getRun(id) {
      return runs.get(id) ?? null;
    },
    async listCompleted() {
      return [...runs.values()]
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
      const run = runs.get(id);
      if (!run || run.status === "completed")
        return run ? structuredClone(run) : null;
      const interrupted: ResearchRun = {
        ...run,
        status: "interrupted",
        completedAt: run.completedAt ?? new Date().toISOString(),
        assessmentRole: run.assessmentRole,
      };
      if (!interrupted.assessmentRole)
        interrupted.assessmentRole = freezeRole(interrupted);
      runs.set(id, interrupted);
      return structuredClone(interrupted);
    },
    async recordBet(bet) {
      const write = betWrites.then(async () => {
        const board = bet.modelPickId
          ? await boardStore.getBoardForPick(bet.modelPickId)
          : null;
        return recordMemoryBet(
          { runs, bets, submissions, fingerprints },
          bet,
          board ? { id: board.game.id, kickoff: board.game.kickoff } : null,
        );
      });
      betWrites = write.then(
        () => undefined,
        () => undefined,
      );
      return write;
    },
    async listBets() {
      return [...bets];
    },
    async recordClosing(input) {
      const saved = recordMemoryClosing(
        {
          runs,
          bets,
          closings,
          pickOpen: (pickId) => boardStore.pickContract(pickId),
        },
        input,
      );
      return { kind: "created", closing: structuredClone(saved) };
    },
    async listClosings() {
      return closings.map((item) => structuredClone(item));
    },
    async recordSettlement(input) {
      const write = betWrites.then(() =>
        recordMemorySettlement({ runs, bets, notices }, input),
      );
      betWrites = write.then(
        () => undefined,
        () => undefined,
      );
      return write;
    },
    async readSettlement(input) {
      return readMemorySettlement({ runs, bets, notices }, input);
    },
    async recordUnclassifiedCompleted(run) {
      runs.set(
        run.id,
        structuredClone({
          ...run,
          status: "completed",
          assessmentRole: null,
          completedAt: null,
        }),
      );
    },
    async recordArchivedClosing(input) {
      const saved = recordMemoryClosing(
        { runs, bets, closings },
        {
          ...input,
          rules: { period: "full-game", overtime: "included" },
          observedAt: "",
          source: input.source,
        },
        "archived-untimestamped",
      );
      return structuredClone(saved);
    },
    async exportJournal() {
      return memoryBackup(runs, bets, closings, notices);
    },
    async restoreJournal(backup) {
      assertRestorable(backup);
      const incoming = memoryFromBackup(backup);
      for (const [id, run] of incoming.runs) {
        const existing = runs.get(id);
        if (existing && JSON.stringify(existing) !== JSON.stringify(run)) {
          throw new Error(
            `Conflicting analysis identifier ${id} does not match the saved record.`,
          );
        }
      }
      for (const bet of incoming.bets) {
        const existing = bets.find((item) => item.id === bet.id);
        if (existing && JSON.stringify(existing) !== JSON.stringify(bet)) {
          throw new Error(
            `Conflicting bet identifier ${bet.id} does not match the saved record.`,
          );
        }
      }
      for (const [id, run] of incoming.runs) {
        if (!runs.has(id)) runs.set(id, run);
        if (run.request?.id) requests.set(run.request.id, id);
      }
      for (const bet of incoming.bets) {
        if (!bets.some((item) => item.id === bet.id)) {
          bets.push({ ...bet, modelPickId: bet.modelPickId ?? null });
          if (bet.submissionId) submissions.set(bet.submissionId, bet.id);
        }
      }
      for (const closing of incoming.closings) {
        if (!closings.some((item) => item.id === closing.id))
          closings.push(closing);
      }
      for (const notice of incoming.notices) {
        if (!notices.some((item) => item.id === notice.id))
          notices.push(notice);
      }
      return memoryBackup(runs, bets, closings, notices);
    },
  };
  return { ...research, ...boardStore };
}

function recordMemoryBet(
  state: {
    runs: Map<string, ResearchRun>;
    bets: ActualBet[];
    submissions: Map<string, string>;
    fingerprints: Map<string, string>;
  },
  input: NewActualBet,
  pickGame: { id: string; kickoff: string } | null,
): RecordBetResult {
  if (!input.analysisId === !input.modelPickId) {
    throw new Error("An actual bet belongs to one analysis or one model pick.");
  }
  let game: { id: string; kickoff: string };
  if (input.modelPickId) {
    if (!pickGame)
      throw new Error(`Model pick not found: ${input.modelPickId}`);
    game = pickGame;
  } else {
    const run = state.runs.get(input.analysisId!);
    if (!run) throw new Error(`Analysis not found: ${input.analysisId}`);
    game = { id: run.game.id, kickoff: run.game.kickoff };
  }
  if (!input.submissionId)
    throw new Error("An actual bet requires a submission identifier.");
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
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        analysisId: input.analysisId,
        modelPickId: input.modelPickId,
        sportsbook: contract.sportsbook,
        market: contract.market,
        selection: contract.selection,
        pointLine: contract.pointLine,
        americanOdds: contract.americanOdds,
        rules: contract.rules,
        stakeUnits: input.stakeUnits,
        placedAt: input.placedAt,
      }),
    )
    .digest("hex");
  const existingId = state.submissions.get(input.submissionId);
  if (existingId) {
    const existing = state.bets.find((item) => item.id === existingId);
    if (!existing)
      throw new Error(
        `Bet submission index is inconsistent: ${input.submissionId}`,
      );
    if (state.fingerprints.get(existing.id) !== fingerprint) {
      return {
        kind: "conflict",
        error:
          "This submission identifier was already used with different inputs.",
      };
    }
    return { kind: "existing", bet: structuredClone(existing) };
  }
  const saved: ActualBet = {
    id: randomUUID(),
    analysisId: input.analysisId ?? null,
    modelPickId: input.modelPickId ?? null,
    submissionId: input.submissionId,
    contractProvenance: "captured",
    sportsbook: contract.sportsbook,
    market: contract.market,
    selection: contract.selection,
    pointLine: contract.pointLine,
    rules: contract.rules,
    americanOdds: contract.americanOdds,
    stakeUnits: input.stakeUnits,
    placedAt: input.placedAt,
  };
  state.bets.push(saved);
  state.submissions.set(input.submissionId, saved.id);
  state.fingerprints.set(saved.id, fingerprint);
  return { kind: "created", bet: structuredClone(saved) };
}

type OpenSide = {
  gameId: string;
  kickoffAt: string;
  market: Market;
  selection: SideSelection;
  pointLine: number | null;
  sportsbook: string;
  americanOdds: number;
  rules: Offer["rules"];
};

function openSide(
  state: {
    runs: Map<string, ResearchRun>;
    bets: ActualBet[];
    pickOpen?: (pickId: string) => OpenPick | null;
  },
  subject: ClosingSubject,
): OpenSide {
  if (subject.kind === "analysis") {
    const run = state.runs.get(subject.id);
    if (!run) throw new Error(`Analysis not found: ${subject.id}`);
    return {
      gameId: run.game.id,
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
  const bet = state.bets.find((item) => item.id === subject.id);
  if (!bet) throw new Error(`Bet not found: ${subject.id}`);
  if (!bet.analysisId) {
    throw new Error(
      "A bet placed from a model pick has no analysis to compare against yet.",
    );
  }
  const run = state.runs.get(bet.analysisId);
  if (!run) throw new Error(`Analysis not found: ${bet.analysisId}`);
  if (!bet.market || !bet.selection || !bet.rules) {
    throw new Error("This bet has no recorded contract to compare.");
  }
  return {
    gameId: run.game.id,
    kickoffAt: run.game.kickoff,
    market: bet.market,
    selection: bet.selection,
    pointLine: bet.pointLine,
    sportsbook: bet.sportsbook,
    americanOdds: bet.americanOdds,
    rules: bet.rules,
  };
}

function recordMemoryClosing(
  state: {
    runs: Map<string, ResearchRun>;
    bets: ActualBet[];
    closings: ClosingObservation[];
    pickOpen?: (pickId: string) => OpenPick | null;
  },
  input: NewClosing,
  provenance: ClosingProvenance = "observed",
): ClosingObservation {
  if (!input.source.trim())
    throw new Error("A closing observation requires a source.");
  const open = openSide(state, input.subject);
  if (provenance === "archived-untimestamped") {
    const saved: ClosingObservation = {
      id: randomUUID(),
      subject: input.subject,
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
      comparison: { available: false, reason: "archived-untimestamped" },
    };
    state.closings.push(saved);
    return saved;
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
  );
  const saved: ClosingObservation = {
    id: randomUUID(),
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
    comparison,
  };
  state.closings.push(saved);
  return saved;
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
  state: {
    runs: Map<string, ResearchRun>;
    bets: ActualBet[];
    notices: StoredNotice[];
  },
  input: RecordSettlementInput,
): RecordSettlementResult {
  const run = state.runs.get(input.analysisId);
  if (!run) throw new Error(`Analysis not found: ${input.analysisId}`);
  if (input.betId) {
    const bet = state.bets.find((item) => item.id === input.betId);
    if (!bet || bet.analysisId !== input.analysisId) {
      throw new Error(`Bet not found: ${input.betId}`);
    }
  }
  if (input.correctsNoticeId) {
    if (!input.reason?.trim()) {
      return { kind: "conflict", error: "A correction requires a reason." };
    }
    const prior = state.notices.find(
      (item) => item.id === input.correctsNoticeId,
    );
    if (!prior || prior.analysisId !== input.analysisId) {
      throw new Error(`Settlement not found: ${input.correctsNoticeId}`);
    }
  }
  const payloadKey = settlementPayloadKey(input);
  const sameEvent = state.notices.filter(
    (item) => item.eventId === input.eventId,
  );
  if (sameEvent.length > 0) {
    const match = sameEvent.find((item) => item.payloadKey === payloadKey);
    if (match) return { kind: "duplicate", noticeId: match.id };
    return {
      kind: "conflict",
      error:
        "This settlement event identifier was already used with different inputs.",
    };
  }
  const saved: StoredNotice = {
    id: randomUUID(),
    eventId: input.eventId,
    analysisId: input.analysisId,
    gameId: null,
    betId: input.betId ?? null,
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

export function gradeFromNotices(
  offer: Offer,
  notices: StoredNotice[],
): SettlementGrade {
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
  if (notice.kind === "postponed" || notice.kind === "unresolved")
    return "unresolved";
  if (notice.kind === "void") return "void";
  return settleOffer(offer, {
    homeScore: notice.homeScore ?? Number.NaN,
    awayScore: notice.awayScore ?? Number.NaN,
    voided: false,
  });
}

function readMemorySettlement(
  state: {
    runs: Map<string, ResearchRun>;
    bets: ActualBet[];
    notices: StoredNotice[];
  },
  input: { analysisId: string; betId?: string | null },
): { assessment: SettlementGrade; bet: SettlementGrade | null } {
  const run = state.runs.get(input.analysisId);
  if (!run) throw new Error(`Analysis not found: ${input.analysisId}`);
  const forRun = state.notices.filter(
    (item) => item.analysisId === input.analysisId,
  );
  const assessment = gradeFromNotices(run.offer, forRun);
  if (!input.betId) return { assessment, bet: null };
  const bet = state.bets.find((item) => item.id === input.betId);
  if (
    !bet ||
    bet.analysisId !== input.analysisId ||
    !bet.market ||
    !bet.selection ||
    !bet.rules
  ) {
    return { assessment, bet: null };
  }
  const contract = parseOffer({
    gameId: run.game.id,
    sportsbook: bet.sportsbook,
    market: bet.market,
    selection: bet.selection,
    pointLine: bet.pointLine ?? undefined,
    americanOdds: bet.americanOdds,
    observedAt: bet.placedAt,
    kickoffAt: run.game.kickoff,
    rules: bet.rules,
  });
  return { assessment, bet: gradeFromNotices(contract, forRun) };
}

type MemoryJournal = JournalExport & {
  runs: ResearchRun[];
  actualBets: ActualBet[];
  closingObservations: ClosingObservation[];
  notices: StoredNotice[];
};

function memoryBackup(
  runs: Map<string, ResearchRun>,
  bets: ActualBet[],
  closings: ClosingObservation[],
  notices: StoredNotice[],
): MemoryJournal {
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
    runs: [...runs.values()].map((run) => structuredClone(run)),
    actualBets: bets.map((bet) => structuredClone(bet)),
    closingObservations: closings.map((closing) => structuredClone(closing)),
    notices: notices.map((notice) => structuredClone(notice)),
  };
}

function memoryFromBackup(backup: JournalExport): {
  runs: Map<string, ResearchRun>;
  bets: ActualBet[];
  closings: ClosingObservation[];
  notices: StoredNotice[];
} {
  const body = backup as MemoryJournal;
  if (!Array.isArray(body.runs)) {
    throw new Error("Journal backup is missing its analysis records.");
  }
  return {
    runs: new Map(body.runs.map((run) => [run.id, structuredClone(run)])),
    bets: (body.actualBets ?? []).map((bet) => structuredClone(bet)),
    closings: (body.closingObservations ?? []).map((closing) =>
      structuredClone(closing),
    ),
    notices: (body.notices ?? []).map((notice) => structuredClone(notice)),
  };
}
