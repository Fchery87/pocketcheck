import { validFinalScores, type Settlement as SettlementResult } from "#lib/domain/settlement.ts";
import type { Offer } from "#lib/domain/offer.ts";
import {
  validateClosingMarketSnapshot,
  validateProtocolRegistration,
  type ClosingMarketSnapshot,
  type ProtocolRegistration,
} from "../models/protocol.ts";
import type { ProviderRequestRecord } from "../providers/contracts.ts";
import type { AttemptRequest } from "./attempt.ts";
import type { GameBoard } from "./board-store.ts";
import { containsSecret } from "./redact.ts";
import type { SavedForecast } from "./forecast-record.ts";
import type { MemoryJournal, StoredNotice } from "./store.ts";

export type GameRecord = {
  id: string;
  sourceGameId: string;
  season: number;
  week: number | null;
  awayTeam: string;
  homeTeam: string;
  kickoffAt: string;
  venue: string | null;
  status: string;
};

export type OfferRecord = Offer & {
  id: string;
  enteredAt: string;
  completedAt: string | null;
};

export type EvidenceRecord = {
  id: string;
  sourceId: string;
  sourceUrl: string | null;
  retrievedAt: string;
  publishedAt: string | null;
  effectiveAt: string | null;
  checksum: string;
  body: unknown;
  origin: "manual" | "automatic";
  completeness: string;
  completedAt: string | null;
  /** The id the evidence packet and report citations use. */
  packetItemId: string | null;
};

export type AnalysisRecord = {
  id: string;
  offerId: string;
  parentId: string | null;
  snapshot: AnalysisSnapshot;
  cutoffAt: string;
  status: "pending" | "running" | "completed" | "failed" | "interrupted";
  conclusion: string | null;
  methodVersion: string | null;
  policyVersion: string | null;
  schemaVersion: string | null;
  promptVersion: string | null;
  evidencePacketHash: string | null;
  provider: string | null;
  model: string | null;
  failureReason: string | null;
  idempotencyKey: string | null;
  completedAt: string | null;
  createdAt: string;
  policy: unknown;
  stages: unknown;
  gaps: unknown;
  usage: unknown;
  probabilityModel: unknown;
  evidenceIds: string[];
  assessmentRole: "primary" | "refresh" | "ineligible" | null;
  assessmentRoleReason: string | null;
  primaryAnalysisId: string | null;
};

export type AnalysisSnapshot = {
  version: 1;
  provenance: "captured" | "legacy-unknown";
  game: GameRecord;
  offer: OfferRecord;
  request?: AttemptRequest;
  providerRequests?: ProviderRequestRecord[];
  providerOutcomeAmbiguous?: boolean;
  forecast?: SavedForecast | null;
};

export type ReportRecord = {
  id: string;
  analysisId: string;
  claims: unknown;
  thesis: string;
  usage: unknown;
  renderedText: string;
  completedAt: string;
  body: unknown;
};

export type UserResearchRecord = {
  id: string;
  analysisId: string;
  lean: string | null;
  rationale: string | null;
};

export type BetContract = {
  market: "moneyline" | "spread" | "total";
  selection: "home" | "away" | "over" | "under";
  pointLine: number | null;
  rules: {
    period: "full-game";
    overtime: "included";
    tie: "push" | "loss" | "win" | "void" | null;
  };
};

/** A bet without `contract` predates independent execution terms. Do not infer them. */
export type BetRecord = {
  id: string;
  offerId: string;
  analysisId: string | null;
  /** The model pick this bet started from. Null for a bet that predates model picks. */
  modelPickId?: string | null;
  submissionId: string | null;
  contract: BetContract | null;
  contractFingerprint: string | null;
  americanOdds: number;
  decimalOdds: number;
  placedAt: string;
  stakeUnits: number;
  sportsbook: string | null;
};

export type ClosingProvenance = "observed" | "archived-untimestamped";

/** A later observation. Null observedAt means an untimestamped archive, not a captured offer. */
export type ClosingRecord = {
  id: string;
  analysisId: string | null;
  betId: string | null;
  modelPickId: string | null;
  provenance: ClosingProvenance;
  sportsbook: string;
  market: BetContract["market"];
  selection: BetContract["selection"];
  pointLine: number | null;
  rules: BetContract["rules"];
  americanOdds: number;
  decimalOdds: number;
  observedAt: string | null;
  source: string;
};

export type SettlementRecord = {
  id: string;
  betId: string | null;
  offerId: string | null;
  result: SettlementResult;
  rules: string;
  source: string;
  reason: string | null;
  settledAt: string;
  correctsId: string | null;
};

export type SettlementNoticeRecord = {
  id: string;
  eventId: string;
  analysisId: string | null;
  betId: string | null;
  kind: "final" | "postponed" | "void" | "unresolved";
  homeScore: number | null;
  awayScore: number | null;
  source: string;
  reason: string | null;
  correctsId: string | null;
  recordedAt: string;
  payloadKey: string;
};

export type JournalExport = {
  version: 1;
  games: GameRecord[];
  offers: OfferRecord[];
  evidence: EvidenceRecord[];
  analyses: AnalysisRecord[];
  reports: ReportRecord[];
  userResearch: UserResearchRecord[];
  bets: BetRecord[];
  settlements: SettlementRecord[];
  closings: ClosingRecord[];
  /** Application settlement events. Absent only on a backup written before they were included. */
  settlementNotices?: SettlementNoticeRecord[];
  /**
   * Game boards, their quotes, and their model picks. Absent on a backup written before boards.
   * A missing list restores as empty. Version 1 remains the only restorable backup.
   */
  gameBoards?: GameBoard[];
  protocolRegistrations?: ProtocolRegistration[];
  closingMarketSnapshots?: ClosingMarketSnapshot[];
  gameSettlementNotices?: StoredNotice[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Supported journal backup format. Version 1 is the only importable backup. */
export const SUPPORTED_JOURNAL_BACKUP_VERSION = 1;

/**
 * Reject a backup before any write. Callers can restore version 1 only when every
 * identifier, snapshot, and relationship is present and internally consistent.
 */
export function assertRestorable(snapshot: JournalExport): void {
  if (snapshot?.version !== SUPPORTED_JOURNAL_BACKUP_VERSION) {
    throw new Error(
      `Unsupported journal backup version. Version ${SUPPORTED_JOURNAL_BACKUP_VERSION} is the only supported backup.`,
    );
  }
  const tables = [
    snapshot.games,
    snapshot.offers,
    snapshot.evidence,
    snapshot.analyses,
    snapshot.reports,
    snapshot.userResearch,
    snapshot.bets,
    snapshot.settlements,
    snapshot.closings,
  ];
  if (tables.some((rows) => !Array.isArray(rows))) {
    throw new Error("Journal backup is missing a required record list.");
  }
  if (
    !Array.isArray(snapshot.protocolRegistrations ?? []) ||
    !Array.isArray(snapshot.closingMarketSnapshots ?? [])
  ) {
    throw new Error("Journal prospective evidence must be lists.");
  }
  const registrationIds = new Set<string>();
  for (const registration of snapshot.protocolRegistrations ?? []) {
    if (
      typeof registration?.id !== "string" ||
      !registration.id ||
      registrationIds.has(registration.id)
    ) {
      throw new Error(
        "Journal backup has a malformed or repeated protocol registration identifier.",
      );
    }
    registrationIds.add(registration.id);
  }
  idsOf(snapshot.closingMarketSnapshots ?? [], "closing market snapshot");
  for (const row of snapshot.protocolRegistrations ?? []) validateProtocolRegistration(row);
  for (const row of snapshot.closingMarketSnapshots ?? []) validateClosingMarketSnapshot(row);
  const sourceGames = new Set([
    ...snapshot.games.map((game) => game.sourceGameId),
    ...(snapshot.gameBoards ?? []).map((board) => board.game.id),
    ...("runs" in snapshot && Array.isArray(snapshot.runs)
      ? snapshot.runs.map((run: { game: { id: string } }) => run.game.id)
      : []),
  ]);
  for (const row of snapshot.closingMarketSnapshots ?? []) {
    if (!sourceGames.has(row.gameId))
      throw new Error(`Closing market snapshot ${row.id} is missing its game.`);
  }
  for (const board of snapshot.gameBoards ?? []) {
    if (
      board.request.explanationFormatVersion !== undefined &&
      board.request.explanationFormatVersion !== 2
    ) {
      throw new Error(`Game board ${board.id} has an unsupported explanation format.`);
    }
    const registrationId = board.request.protocolRegistrationId;
    if (registrationId && !registrationIds.has(registrationId)) {
      throw new Error(`Game board ${board.id} references a missing protocol registration.`);
    }
    for (const market of board.markets) {
      const forecastId = market.pick?.forecast?.protocolRegistrationId;
      if (forecastId && (forecastId !== registrationId || !registrationIds.has(forecastId))) {
        throw new Error(
          `Model pick ${market.pick?.id} references an incompatible protocol registration.`,
        );
      }
    }
  }
  if (!Array.isArray(snapshot.gameSettlementNotices ?? []))
    throw new Error("Game settlement notices must be a list.");
  const gameNotices = idsOf(snapshot.gameSettlementNotices ?? [], "game settlement notice");
  const boardGames = new Set((snapshot.gameBoards ?? []).map((board) => board.game.id));
  const noticeEvents = new Set((snapshot.settlementNotices ?? []).map((notice) => notice.eventId));
  for (const notice of snapshot.gameSettlementNotices ?? []) {
    if (
      !notice.gameId ||
      !boardGames.has(notice.gameId) ||
      notice.analysisId !== null ||
      notice.betId !== null ||
      !notice.eventId ||
      !notice.source ||
      !notice.payloadKey ||
      !Number.isFinite(Date.parse(notice.recordedAt)) ||
      !["final", "postponed", "void", "unresolved"].includes(notice.kind) ||
      (notice.kind === "final" && !validFinalScores(notice.homeScore, notice.awayScore))
    ) {
      throw new Error(`Game settlement notice ${notice.id} is invalid.`);
    }
    if (noticeEvents.has(notice.eventId))
      throw new Error(`Repeated settlement event identifier ${notice.eventId}.`);
    noticeEvents.add(notice.eventId);
    if (notice.correctsId) {
      requireReference(
        gameNotices,
        notice.correctsId,
        `Game settlement notice ${notice.id} is missing its correction.`,
      );
      const prior = snapshot.gameSettlementNotices!.find((item) => item.id === notice.correctsId)!;
      if (
        prior.gameId !== notice.gameId ||
        Date.parse(prior.recordedAt) >= Date.parse(notice.recordedAt)
      ) {
        throw new Error(
          `Game settlement notice ${notice.id} must correct an earlier notice for the same game.`,
        );
      }
    }
  }
  if (hasSettlementCycle(snapshot.gameSettlementNotices ?? []))
    throw new Error("Game settlement notice correction relationships contain a cycle.");
  const games = idsOf(snapshot.games, "game");
  const offers = idsOf(snapshot.offers, "offer");
  const evidence = idsOf(snapshot.evidence, "evidence");
  const analyses = idsOf(snapshot.analyses, "analysis");
  const reports = idsOf(snapshot.reports, "report");
  const research = idsOf(snapshot.userResearch, "user research");
  const bets = idsOf(snapshot.bets, "bet");
  const settlements = idsOf(snapshot.settlements, "settlement");
  idsOf(snapshot.closings, "closing observation");
  idsOf(snapshot.settlementNotices ?? [], "settlement notice");

  for (const offer of snapshot.offers) {
    requireReference(games, offer.gameId, `Offer ${offer.id} is missing its game.`);
    requireShape(
      offer.market,
      ["moneyline", "spread", "total"],
      `Offer ${offer.id} has an unknown market.`,
    );
  }
  for (const analysis of snapshot.analyses) {
    requireReference(offers, analysis.offerId, `Analysis ${analysis.id} is missing its offer.`);
    if (analysis.parentId) {
      requireReference(
        analyses,
        analysis.parentId,
        `Analysis ${analysis.id} is missing its parent relationship.`,
      );
    }
    if (analysis.primaryAnalysisId) {
      requireReference(
        analyses,
        analysis.primaryAnalysisId,
        `Analysis ${analysis.id} is missing its primary analysis relationship.`,
      );
    }
    if (!analysis.snapshot || analysis.snapshot.version !== 1) {
      throw new Error(`Analysis ${analysis.id} has an unsupported snapshot version.`);
    }
    if (
      analysis.snapshot.provenance !== "captured" &&
      analysis.snapshot.provenance !== "legacy-unknown"
    ) {
      throw new Error(`Analysis ${analysis.id} has an unknown snapshot provenance.`);
    }
    for (const evidenceId of analysis.evidenceIds) {
      requireReference(evidence, evidenceId, `Analysis ${analysis.id} is missing linked evidence.`);
    }
    if (
      analysis.status === "completed" &&
      (analysis.conclusion === null || analysis.completedAt === null)
    ) {
      throw new Error(
        `Completed analysis ${analysis.id} is missing its conclusion or completion time.`,
      );
    }
    if (!["pending", "running", "completed", "failed", "interrupted"].includes(analysis.status)) {
      throw new Error(`Analysis ${analysis.id} has an unknown status.`);
    }
  }
  if (hasCycle(snapshot.analyses)) {
    throw new Error("Analysis parent relationships contain a cycle.");
  }
  for (const report of snapshot.reports) {
    requireReference(analyses, report.analysisId, `Report ${report.id} is missing its analysis.`);
  }
  if (reports.size !== snapshot.reports.length || research.size !== snapshot.userResearch.length) {
    throw new Error("Journal backup repeats an identifier.");
  }
  for (const row of snapshot.userResearch) {
    requireReference(analyses, row.analysisId, `User research ${row.id} is missing its analysis.`);
  }
  const picks = new Set(
    (snapshot.gameBoards ?? []).flatMap((board) =>
      board.markets.flatMap((market) => (market.pick ? [market.pick.id] : [])),
    ),
  );
  for (const bet of snapshot.bets) {
    requireReference(offers, bet.offerId, `Bet ${bet.id} is missing its offer.`);
    if (bet.analysisId) {
      requireReference(analyses, bet.analysisId, `Bet ${bet.id} is missing its analysis.`);
    }
    if (bet.modelPickId && !picks.has(bet.modelPickId)) {
      throw new Error(`Bet ${bet.id} is missing its model pick.`);
    }
  }
  for (const settlement of snapshot.settlements) {
    if (!settlement.betId && !settlement.offerId) {
      throw new Error(`Settlement ${settlement.id} is missing the record it grades.`);
    }
    if (settlement.betId) {
      requireReference(bets, settlement.betId, `Settlement ${settlement.id} is missing its bet.`);
    }
    if (settlement.offerId) {
      requireReference(
        offers,
        settlement.offerId,
        `Settlement ${settlement.id} is missing its offer.`,
      );
    }
    if (settlement.correctsId) {
      requireReference(
        settlements,
        settlement.correctsId,
        `Settlement ${settlement.id} is missing the notice it corrects.`,
      );
    }
  }
  if (hasSettlementCycle(snapshot.settlements)) {
    throw new Error("Settlement correction relationships contain a cycle.");
  }
  const betById = new Map(snapshot.bets.map((bet) => [bet.id, bet]));
  const noticeById = new Map((snapshot.settlementNotices ?? []).map((row) => [row.id, row]));
  const settlementEvents = new Set<string>();
  for (const notice of snapshot.settlementNotices ?? []) {
    if (notice.kind === "final" && !validFinalScores(notice.homeScore, notice.awayScore))
      throw new Error(`Settlement notice ${notice.id} has invalid scores.`);
    const subject = settlementNoticeSubject(notice, analyses, betById);
    if (notice.correctsId) {
      const prior = noticeById.get(notice.correctsId);
      if (!prior) {
        throw new Error(`Settlement notice ${notice.id} is missing the notice it corrects.`);
      }
      const priorSubject = settlementNoticeSubject(prior, analyses, betById);
      if (priorSubject.kind !== subject.kind || priorSubject.id !== subject.id) {
        throw new Error(
          `Settlement notice ${notice.id} must correct a notice for the same record.`,
        );
      }
    }
    if (!notice.eventId || !notice.recordedAt || !notice.payloadKey) {
      throw new Error(`Settlement notice ${notice.id} is missing its event history.`);
    }
    if (settlementEvents.has(notice.eventId))
      throw new Error(`Repeated settlement event identifier ${notice.eventId}.`);
    settlementEvents.add(notice.eventId);
  }
  if (
    hasSettlementCycle(
      (snapshot.settlementNotices ?? []).map((row) => ({
        id: row.id,
        correctsId: row.correctsId,
      })),
    )
  ) {
    throw new Error("Settlement notice correction relationships contain a cycle.");
  }
  for (const closing of snapshot.closings) {
    if (
      (closing.provenance === "observed" && closing.observedAt === null) ||
      (closing.provenance === "archived-untimestamped" && closing.observedAt !== null)
    ) {
      throw new Error(`Closing observation ${closing.id} has invalid timestamp provenance.`);
    }
    if (closing.observedAt !== null && !Number.isFinite(Date.parse(closing.observedAt))) {
      throw new Error(`Closing observation ${closing.id} has an invalid timestamp.`);
    }
    if (!closing.analysisId && !closing.betId && !closing.modelPickId) {
      throw new Error(`Closing observation ${closing.id} is missing the record it observes.`);
    }
    if (closing.analysisId) {
      requireReference(
        analyses,
        closing.analysisId,
        `Closing observation ${closing.id} is missing its analysis.`,
      );
    }
    if (closing.betId) {
      requireReference(
        bets,
        closing.betId,
        `Closing observation ${closing.id} is missing its bet.`,
      );
    }
  }
}

/** What a research settlement notice grades. A game notice travels in its own list. */
export type SettlementNoticeSubject =
  | { kind: "analysis"; id: string }
  | { kind: "bet"; id: string };

/**
 * An analysis notice may also name that analysis's bet. A notice without an analysis grades a bet
 * placed from a model pick.
 */
function settlementNoticeSubject(
  notice: SettlementNoticeRecord,
  analyses: Set<string>,
  bets: Map<string, BetRecord>,
): SettlementNoticeSubject {
  if (notice.analysisId) {
    requireReference(
      analyses,
      notice.analysisId,
      `Settlement notice ${notice.id} is missing its analysis.`,
    );
    if (notice.betId && bets.get(notice.betId)?.analysisId !== notice.analysisId) {
      throw new Error(`Settlement notice ${notice.id} is missing its bet.`);
    }
    return { kind: "analysis", id: notice.analysisId };
  }
  if (!notice.betId) {
    throw new Error(`Settlement notice ${notice.id} is missing the record it grades.`);
  }
  if (!bets.get(notice.betId)?.modelPickId) {
    throw new Error(`Settlement notice ${notice.id} is missing its bet.`);
  }
  return { kind: "bet", id: notice.betId };
}

function idsOf(rows: Array<{ id: string }>, label: string): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (typeof row?.id !== "string" || !UUID.test(row.id)) {
      throw new Error(`Journal backup has a malformed ${label} identifier.`);
    }
    if (ids.has(row.id)) throw new Error(`Journal backup repeats ${label} identifier ${row.id}.`);
    ids.add(row.id);
  }
  return ids;
}

function requireReference(ids: Set<string>, id: string | null | undefined, message: string): void {
  if (!id || !ids.has(id)) throw new Error(message);
}

function requireShape(value: string, allowed: readonly string[], message: string): void {
  if (!allowed.includes(value)) throw new Error(message);
}

function hasCycle(rows: Array<{ id: string; parentId: string | null }>): boolean {
  const parent = new Map(rows.map((row) => [row.id, row.parentId]));
  for (const row of rows) {
    const seen = new Set<string>();
    let current: string | null = row.id;
    while (current) {
      if (seen.has(current)) return true;
      seen.add(current);
      current = parent.get(current) ?? null;
    }
  }
  return false;
}

function hasSettlementCycle(rows: Array<{ id: string; correctsId: string | null }>): boolean {
  return hasCycle(rows.map((row) => ({ id: row.id, parentId: row.correctsId })));
}
/**
 * Records are equal when they hold the same values. Object key order does not matter, array order
 * does, and an undefined property is absent, as it is once written to a file.
 */
export function sameRecord(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameRecord(item, right[index]))
    );
  }
  if (!isObject(left) || !isObject(right)) return false;
  const leftKeys = definedKeys(left);
  const rightKeys = definedKeys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && sameRecord(left[key], right[key]))
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function definedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) => value[key] !== undefined);
}

// Every backup field, named here so a field added to a journal must be listed to be written. The
// memory journal used by fixture mode keeps its records in four lists of its own. Settings and
// credentials have no entry, so they cannot reach a file.
const BACKUP_FIELDS: { [Field in keyof Required<MemoryJournal>]: true } = {
  version: true,
  games: true,
  offers: true,
  evidence: true,
  analyses: true,
  reports: true,
  userResearch: true,
  bets: true,
  settlements: true,
  closings: true,
  settlementNotices: true,
  gameBoards: true,
  protocolRegistrations: true,
  closingMarketSnapshots: true,
  gameSettlementNotices: true,
  runs: true,
  actualBets: true,
  closingObservations: true,
  notices: true,
};

/**
 * The bytes of a backup file. The whole graph is checked first, so a file is always restorable.
 * Saved records are immutable, so a record holding a secret rejects the export with its path
 * rather than being rewritten into a backup that no longer matches the journal.
 */
export function encodeJournalBackup(
  backup: JournalExport,
  options: { secrets: readonly string[] },
): string {
  assertRestorable(backup);
  const file = Object.fromEntries(
    (Object.keys(BACKUP_FIELDS) as (keyof MemoryJournal)[])
      .filter((field) => (backup as Partial<MemoryJournal>)[field] !== undefined)
      .map((field) => [field, (backup as Partial<MemoryJournal>)[field]]),
  );
  const exposed = secretPaths(file, "", options.secrets);
  if (exposed.length > 0) {
    throw new Error(
      `No backup was written. These saved records contain a credential: ${exposed.join(", ")}. ` +
        "Rotate the credential, then remediate those records with their audit history kept.",
    );
  }
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Field names whose value is a credential wherever they appear in a saved record. */
export const CREDENTIAL_KEYS: ReadonlySet<string> = new Set([
  "authorization",
  "proxy-authorization",
  "x-api-key",
  "api-key",
  "apikey",
  "api_key",
  "cookie",
  "set-cookie",
]);

function secretPaths(value: unknown, path: string, secrets: readonly string[]): string[] {
  if (typeof value === "string") return containsSecret(value, secrets) ? [path] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => {
      const id = isObject(item) && typeof item.id === "string" ? `id=${item.id}` : index;
      return secretPaths(item, `${path}[${id}]`, secrets);
    });
  }
  if (isObject(value)) {
    return Object.entries(value).flatMap(([key, item]) => {
      const at = path ? `${path}.${key}` : key;
      const credential = CREDENTIAL_KEYS.has(key.toLowerCase()) && item != null && item !== "";
      return credential ? [at] : secretPaths(item, at, secrets);
    });
  }
  return [];
}
