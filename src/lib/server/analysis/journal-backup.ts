import { validFinalScores, type Settlement as SettlementResult } from "#lib/domain/settlement.ts";
import { provesAnchorPair } from "#lib/domain/board.ts";
import type { Offer } from "#lib/domain/offer.ts";
import {
  validateClosingMarketSnapshot,
  validateProtocolRegistration,
  type ClosingMarketSnapshot,
  type ProtocolRegistration,
} from "../models/protocol.ts";
import type { ProviderRequestRecord } from "../providers/contracts.ts";
import type { AttemptRequest } from "./attempt.ts";
import { correctionIsLater, type GameBoard } from "./board-store.ts";
import {
  decideExplanationWrite,
  type ExplanationEvent,
  type ExplanationCommand,
} from "./board-explanation.ts";
import { containsSecret } from "./redact.ts";
import type { SavedForecast } from "./forecast-record.ts";
import type { StoredNotice } from "./store.ts";
import { decodeMemoryV1, MEMORY_V1_FIELDS } from "./journal-backup-legacy.ts";
import { explanationShapeProblems } from "./pick-explanation.ts";

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
  explanationEvents?: ExplanationEvent[];
  protocolRegistrations?: ProtocolRegistration[];
  closingMarketSnapshots?: ClosingMarketSnapshot[];
  gameSettlementNotices?: StoredNotice[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Supported journal backup format. Version 1 is the only importable backup. */
export const SUPPORTED_JOURNAL_BACKUP_VERSION = 1;

declare const restorable: unique symbol;

/** A backup whose every record and relationship was checked. Only a decoded file is written. */
export type RestorableJournal = JournalExport & { readonly [restorable]: true };

/**
 * Field kinds. `?` allows null. `=` also allows the field to be absent from a file written before
 * the field existed, which means null, the field's established legacy default.
 */
type FieldSpec = `${FieldKind}${"" | "?" | "?="}`;
type FieldKind =
  | "uuid"
  | "text"
  | "integer"
  | "number"
  | "instant"
  | "boolean"
  | "object"
  | "array"
  | "json";

type RecordCollection = Exclude<
  keyof JournalExport,
  | "version"
  | "gameBoards"
  | "protocolRegistrations"
  | "closingMarketSnapshots"
  | "explanationEvents"
>;

const GAME_FIELDS = {
  id: "uuid",
  sourceGameId: "text",
  season: "integer",
  week: "integer?",
  awayTeam: "text",
  homeTeam: "text",
  kickoffAt: "instant",
  venue: "text?",
  status: "text",
} satisfies Record<keyof GameRecord, FieldSpec>;

const NOTICE_FIELDS = {
  id: "uuid",
  eventId: "text",
  analysisId: "uuid?",
  betId: "uuid?",
  kind: "text",
  homeScore: "integer?",
  awayScore: "integer?",
  source: "text",
  reason: "text?",
  correctsId: "uuid?",
  recordedAt: "instant",
  payloadKey: "text",
} satisfies Record<keyof SettlementNoticeRecord, FieldSpec>;

/** Every field a version 1 record may hold. A field outside this table is a newer format. */
const RECORD_FIELDS: { [Collection in RecordCollection]: Record<string, FieldSpec> } = {
  games: GAME_FIELDS,
  offers: {
    id: "uuid",
    gameId: "uuid",
    sportsbook: "text",
    market: "text",
    selection: "text",
    pointLine: "number?",
    americanOdds: "integer",
    decimalOdds: "number",
    observedAt: "instant",
    enteredAt: "instant",
    kickoffAt: "instant",
    rules: "object",
    opposing: "object?=",
    completedAt: "instant?",
  } satisfies Record<keyof OfferRecord, FieldSpec>,
  evidence: {
    id: "uuid",
    sourceId: "text",
    sourceUrl: "text?",
    retrievedAt: "instant",
    publishedAt: "instant?",
    effectiveAt: "instant?",
    checksum: "text",
    body: "json",
    origin: "text",
    completeness: "text",
    completedAt: "instant?",
    packetItemId: "text?=",
  } satisfies Record<keyof EvidenceRecord, FieldSpec>,
  analyses: {
    id: "uuid",
    offerId: "uuid",
    parentId: "uuid?",
    snapshot: "object",
    cutoffAt: "instant",
    status: "text",
    conclusion: "text?",
    methodVersion: "text?",
    policyVersion: "text?",
    schemaVersion: "text?",
    promptVersion: "text?",
    evidencePacketHash: "text?",
    provider: "text?",
    model: "text?",
    failureReason: "text?",
    idempotencyKey: "text?",
    completedAt: "instant?",
    createdAt: "instant",
    policy: "json?",
    stages: "json?",
    gaps: "json?=",
    usage: "json?",
    probabilityModel: "json?=",
    evidenceIds: "array",
    assessmentRole: "text?=",
    assessmentRoleReason: "text?=",
    primaryAnalysisId: "uuid?=",
  } satisfies Record<keyof AnalysisRecord, FieldSpec>,
  reports: {
    id: "uuid",
    analysisId: "uuid",
    claims: "json",
    thesis: "text",
    usage: "json?",
    renderedText: "text",
    completedAt: "instant",
    body: "json?=",
  } satisfies Record<keyof ReportRecord, FieldSpec>,
  userResearch: {
    id: "uuid",
    analysisId: "uuid",
    lean: "text?",
    rationale: "text?",
  } satisfies Record<keyof UserResearchRecord, FieldSpec>,
  bets: {
    id: "uuid",
    offerId: "uuid",
    analysisId: "uuid?",
    modelPickId: "uuid?=",
    submissionId: "text?=",
    contract: "object?=",
    contractFingerprint: "text?=",
    americanOdds: "integer",
    decimalOdds: "number",
    placedAt: "instant",
    stakeUnits: "number",
    sportsbook: "text?=",
  } satisfies Record<keyof BetRecord, FieldSpec>,
  settlements: {
    id: "uuid",
    betId: "uuid?",
    offerId: "uuid?",
    result: "text",
    rules: "text",
    source: "text",
    reason: "text?",
    settledAt: "instant",
    correctsId: "uuid?",
  } satisfies Record<keyof SettlementRecord, FieldSpec>,
  closings: {
    id: "uuid",
    analysisId: "uuid?",
    betId: "uuid?",
    modelPickId: "uuid?=",
    provenance: "text",
    sportsbook: "text",
    market: "text",
    selection: "text",
    pointLine: "number?",
    rules: "object",
    americanOdds: "integer",
    decimalOdds: "number",
    observedAt: "instant?",
    source: "text",
  } satisfies Record<keyof ClosingRecord, FieldSpec>,
  settlementNotices: NOTICE_FIELDS,
  gameSettlementNotices: { ...NOTICE_FIELDS, gameId: "text?" } satisfies Record<
    keyof StoredNotice,
    FieldSpec
  >,
};

/**
 * Board fields, and the versions of each versioned board format this reader accepts. A later
 * board format adds its field here together with the versions it accepts, so an older reader
 * rejects that file instead of dropping the field on restore.
 */
const BOARD_FIELDS = new Set<string>([
  "id",
  "request",
  "parentId",
  "status",
  "game",
  "sportsbook",
  "observedAt",
  "cutoffAt",
  "markets",
  "evidence",
  "gaps",
  "failureReason",
  "lean",
  "drafter",
  "providerRequests",
  "providerOutcomeAmbiguous",
  "usage",
  "explanation",
  "withdrawal",
  "createdAt",
  "completedAt",
] satisfies (keyof GameBoard)[]);
const BOARD_REQUEST_FIELDS = new Set<string>([
  "id",
  "hash",
  "protocolRegistrationId",
  "explanationFormatVersion",
  "lifecycleFormat",
] satisfies (keyof GameBoard["request"])[]);
const BOARD_MARKET_FIELDS = new Set<string>([
  "market",
  "offers",
  "quotes",
  "pricing",
  "pick",
  "noPickReason",
] satisfies (keyof GameBoard["markets"][number])[]);
const MODEL_PICK_FIELDS = new Set<string>([
  "id",
  "boardId",
  "market",
  "parentPickId",
  "forecastingModel",
  "calculation",
  "forecast",
  "role",
  "createdAt",
] satisfies (keyof NonNullable<GameBoard["markets"][number]["pick"]>)[]);
const EXPLANATION_FORMAT_VERSIONS: readonly unknown[] = [undefined, 2];

const BACKUP_COLLECTIONS = [
  "games",
  "offers",
  "evidence",
  "analyses",
  "reports",
  "userResearch",
  "bets",
  "settlements",
  "closings",
  "settlementNotices",
  "gameBoards",
  "explanationEvents",
  "protocolRegistrations",
  "closingMarketSnapshots",
  "gameSettlementNotices",
] as const satisfies Exclude<keyof JournalExport, "version">[];

const REQUIRED_COLLECTIONS: ReadonlySet<string> = new Set([
  "games",
  "offers",
  "evidence",
  "analyses",
  "reports",
  "userResearch",
  "bets",
  "settlements",
  "closings",
]);

/**
 * Parse a backup file. Recognized older memory layouts are converted to version 1 records first.
 * A missing optional list or field means its legacy default. An unknown version, list, or field,
 * a malformed record, or a broken relationship is rejected before any write.
 */
export function decodeJournalBackup(input: unknown): RestorableJournal {
  if (
    !isObject(input) ||
    Array.isArray(input) ||
    input.version !== SUPPORTED_JOURNAL_BACKUP_VERSION
  ) {
    throw new Error(
      `Unsupported journal backup version. Version ${SUPPORTED_JOURNAL_BACKUP_VERSION} is the only supported backup.`,
    );
  }
  for (const key of Object.keys(input)) {
    if (
      key !== "version" &&
      !(BACKUP_COLLECTIONS as readonly string[]).includes(key) &&
      !(MEMORY_V1_FIELDS as readonly string[]).includes(key)
    ) {
      throw new Error(
        `Journal backup has an unsupported list "${key}". A newer PocketCheck may have written it.`,
      );
    }
  }
  const file = MEMORY_V1_FIELDS.some((key) => key in input) ? fromMemoryV1(input) : input;
  const parsed: Record<string, unknown> = { version: SUPPORTED_JOURNAL_BACKUP_VERSION };
  for (const collection of BACKUP_COLLECTIONS) {
    const rows = file[collection];
    if (rows === undefined && !REQUIRED_COLLECTIONS.has(collection)) {
      parsed[collection] = [];
      continue;
    }
    if (!Array.isArray(rows)) {
      throw new Error(`Journal backup list "${collection}" is missing or is not a list.`);
    }
    parsed[collection] =
      collection === "gameBoards"
        ? rows.map(parseBoard)
        : collection === "protocolRegistrations" ||
            collection === "closingMarketSnapshots" ||
            collection === "explanationEvents"
          ? rows.map((row) => structuredClone(row))
          : rows.map((row) => parseRecord(collection, row));
  }
  const backup = parsed as JournalExport;
  assertRestorable(backup);
  assertStorableIdentities(backup);
  return canonicalOrder(backup) as RestorableJournal;
}

/**
 * A memory backup written before both journals shared version 1 records. When a file also holds
 * normalized records, both representations must describe the same records.
 */
function fromMemoryV1(file: Record<string, unknown>): Record<string, unknown> {
  const decoded = decodeMemoryV1(file);
  const lists = (source: Record<string, unknown>) =>
    canonicalOrder(
      Object.fromEntries(
        Object.entries(source).filter(([, rows]) => Array.isArray(rows)),
      ) as unknown as JournalExport,
    ) as unknown as Record<string, unknown[] | undefined>;
  const own = lists(file);
  const converted = lists(decoded);
  for (const key of Object.keys(decoded)) {
    if (key === "gameSettlementNotices" || !own[key]?.length) continue;
    if (!sameRecord(own[key], converted[key])) {
      throw new Error(
        `Journal backup mixes memory records and version 1 "${key}" records that disagree.`,
      );
    }
  }
  const rest = Object.fromEntries(
    Object.entries(file).filter(([key]) => !(MEMORY_V1_FIELDS as readonly string[]).includes(key)),
  );
  return { ...rest, ...decoded };
}

function parseRecord(collection: RecordCollection, value: unknown): Record<string, unknown> {
  const label = COLLECTION_LABELS[collection];
  if (!isObject(value) || Array.isArray(value)) {
    throw new Error(`Journal backup has a malformed ${label} record.`);
  }
  const fields = RECORD_FIELDS[collection];
  const name = typeof value.id === "string" ? `${label} ${value.id}` : label;
  for (const key of Object.keys(value)) {
    if (!(key in fields) && value[key] !== undefined) {
      throw new Error(`Journal backup ${name} has an unsupported field "${key}".`);
    }
  }
  const record: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(fields)) {
    const nullable = spec.includes("?");
    const kind = spec.replace(/[?=]/g, "") as FieldKind;
    let field = value[key];
    if (field === undefined && spec.endsWith("=")) field = null;
    if (field === undefined) {
      throw new Error(`Journal backup ${name} is missing "${key}".`);
    }
    if (field === null ? !nullable : !fieldMatches(kind, field)) {
      if (kind === "uuid" && key === "id") {
        throw new Error(`Journal backup has a malformed ${label} identifier.`);
      }
      throw new Error(`Journal backup ${name} has an invalid "${key}".`);
    }
    record[key] = structuredClone(field);
  }
  return record;
}

function fieldMatches(kind: FieldKind, value: unknown): boolean {
  switch (kind) {
    case "uuid":
      return typeof value === "string" && UUID.test(value);
    case "text":
      return typeof value === "string";
    case "integer":
      return Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "instant":
      return typeof value === "string" && Number.isFinite(Date.parse(value));
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return isObject(value) && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "json":
      return true;
  }
}

const COLLECTION_LABELS: Record<RecordCollection, string> = {
  games: "game",
  offers: "offer",
  evidence: "evidence",
  analyses: "analysis",
  reports: "report",
  userResearch: "user research",
  bets: "bet",
  settlements: "settlement",
  closings: "closing observation",
  settlementNotices: "settlement notice",
  gameSettlementNotices: "game settlement notice",
};

function parseBoard(value: unknown): GameBoard {
  if (!isObject(value) || Array.isArray(value)) {
    throw new Error("Journal backup has a malformed game board record.");
  }
  const id = typeof value.id === "string" && UUID.test(value.id) ? value.id : null;
  if (!id) throw new Error("Journal backup has a malformed game board identifier.");
  requireKnownFields(value, BOARD_FIELDS, `Game board ${id}`);
  const request = value.request;
  if (!isObject(request) || typeof request.id !== "string" || typeof request.hash !== "string") {
    throw new Error(`Game board ${id} has a malformed request.`);
  }
  requireKnownFields(request, BOARD_REQUEST_FIELDS, `Game board ${id} request`);
  if (request.lifecycleFormat !== undefined && request.lifecycleFormat !== "forecast-first-v1")
    throw new Error(`Game board ${id} has an unsupported lifecycle format.`);
  if (!EXPLANATION_FORMAT_VERSIONS.includes(request.explanationFormatVersion)) {
    throw new Error(`Game board ${id} has an unsupported explanation format.`);
  }
  if (!Array.isArray(value.markets) || !isObject(value.game) || typeof value.game.id !== "string") {
    throw new Error(`Game board ${id} is missing its game or markets.`);
  }
  if (
    !["pending", "running", "completed", "failed", "interrupted"].includes(String(value.status))
  ) {
    throw new Error(`Game board ${id} has an unknown status.`);
  }
  if (
    value.parentId !== null &&
    !(typeof value.parentId === "string" && UUID.test(value.parentId))
  ) {
    throw new Error(`Game board ${id} has a malformed parent relationship.`);
  }
  if (
    !fieldMatches("instant", value.createdAt) ||
    (value.completedAt !== null && !fieldMatches("instant", value.completedAt))
  ) {
    throw new Error(`Game board ${id} has an invalid timestamp.`);
  }
  for (const market of value.markets) {
    if (!isObject(market)) throw new Error(`Game board ${id} has a malformed market.`);
    requireKnownFields(market, BOARD_MARKET_FIELDS, `Game board ${id} market`);
    if (
      market.pricing !== undefined &&
      !(
        Array.isArray(market.offers) &&
        market.offers.length === 2 &&
        provesAnchorPair(market as Parameters<typeof provesAnchorPair>[0])
      )
    ) {
      throw new Error(
        `Game board ${id} has a ${String(market.market)} anchor pair in an unsupported format or on other contracts.`,
      );
    }
    if (market.pick !== null && market.pick !== undefined) {
      if (!isObject(market.pick)) throw new Error(`Game board ${id} has a malformed model pick.`);
      requireKnownFields(market.pick, MODEL_PICK_FIELDS, `Game board ${id} model pick`);
      if (typeof market.pick.id !== "string" || !UUID.test(market.pick.id)) {
        throw new Error(`Game board ${id} has a malformed model pick identifier.`);
      }
    }
  }
  const board = structuredClone(value) as unknown as GameBoard;
  // Boards written before withdrawals or extra quotes: never withdrawn, no extra quotes.
  return {
    ...board,
    markets: board.markets.map((market) => ({ ...market, quotes: market.quotes ?? [] })),
    withdrawal: board.withdrawal ?? null,
  };
}

function requireKnownFields(
  value: Record<string, unknown>,
  known: ReadonlySet<string>,
  name: string,
) {
  for (const key of Object.keys(value)) {
    if (!known.has(key) && value[key] !== undefined) {
      throw new Error(
        `${name} has an unsupported field "${key}". A newer PocketCheck may have written it.`,
      );
    }
  }
}

function byId(left: { id: string }, right: { id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function byTimeThenId(time: (row: never) => string) {
  return (left: { id: string }, right: { id: string }): number => {
    const a = time(left as never);
    const b = time(right as never);
    return a < b ? -1 : a > b ? 1 : byId(left, right);
  };
}

/**
 * The same journal always lists its records in the same order: by identifier, or by the time
 * the record was made and then identifier. Order inside a saved record is never changed.
 */
export function canonicalOrder(backup: JournalExport): JournalExport {
  const sorted = <T extends { id: string }>(
    rows: T[] | undefined,
    order: (left: T, right: T) => number = byId,
  ) => (rows === undefined ? undefined : [...rows].sort(order));
  const result: JournalExport = {
    ...backup,
    games: sorted(backup.games)!,
    offers: sorted(backup.offers)!,
    evidence: sorted(backup.evidence)!,
    analyses: sorted(
      backup.analyses,
      byTimeThenId((row: AnalysisRecord) => row.createdAt),
    )!,
    reports: sorted(backup.reports)!,
    userResearch: sorted(backup.userResearch)!,
    bets: sorted(backup.bets)!,
    settlements: sorted(backup.settlements)!,
    closings: sorted(backup.closings)!,
    settlementNotices: sorted(
      backup.settlementNotices,
      byTimeThenId((row: SettlementNoticeRecord) => row.recordedAt),
    ),
    gameBoards: sorted(
      backup.gameBoards,
      byTimeThenId((row: GameBoard) => row.createdAt),
    ),
    explanationEvents: sorted(
      backup.explanationEvents,
      (a, b) => a.boardId.localeCompare(b.boardId) || a.sequence - b.sequence,
    ),
    protocolRegistrations: sorted(
      backup.protocolRegistrations,
      byTimeThenId((row: ProtocolRegistration) => row.registeredAt),
    ),
    closingMarketSnapshots: sorted(
      backup.closingMarketSnapshots,
      byTimeThenId((row: ClosingMarketSnapshot) => row.recordedAt),
    ),
    gameSettlementNotices: sorted(
      backup.gameSettlementNotices,
      byTimeThenId((row: StoredNotice) => row.recordedAt),
    ),
  };
  for (const key of Object.keys(result) as (keyof JournalExport)[]) {
    if (result[key] === undefined) delete result[key];
  }
  return result;
}

/**
 * Reject a backup before any write. Callers can restore version 1 only when every
 * identifier, snapshot, and relationship is present and internally consistent.
 */
export function assertRestorable(snapshot: JournalExport): void {
  const forecasts = [
    ...(snapshot.analyses ?? []).map((analysis) => ({
      id: analysis.id,
      forecast: analysis.snapshot.forecast,
    })),
    ...(snapshot.gameBoards ?? []).flatMap((board) =>
      board.markets.flatMap((market) =>
        market.pick ? [{ id: market.pick.id, forecast: market.pick.forecast }] : [],
      ),
    ),
  ];
  for (const { id, forecast } of forecasts) {
    const checksum = forecast?.marketEligibility?.attestationChecksum;
    if (
      checksum !== undefined &&
      (typeof checksum !== "string" || !/^[a-f0-9]{64}$/.test(checksum))
    )
      throw new Error(`Forecast ${id} has an invalid release attestation checksum.`);
  }
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
  ]);
  for (const row of snapshot.closingMarketSnapshots ?? []) {
    if (!sourceGames.has(row.gameId))
      throw new Error(`Closing market snapshot ${row.id} is missing its game.`);
  }
  for (const board of snapshot.gameBoards ?? []) {
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
      if (prior.gameId !== notice.gameId || !correctionIsLater(prior, notice.recordedAt)) {
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
      if (!correctionIsLater(prior, notice.recordedAt)) {
        throw new Error(
          `Settlement notice ${notice.id} must correct an earlier notice for the same record.`,
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

/**
 * The identities a journal stores once: one row per identifier, game, request, submission, and
 * analysis report, and one primary per game (and per game and market for model picks). A file
 * that repeats one could not be written to either journal.
 */
function assertStorableIdentities(snapshot: JournalExport): void {
  assertAssessmentRoles(snapshot.analyses);
  requireUnique(snapshot.games, (row) => row.sourceGameId, "game source identifier");
  requireUnique(snapshot.analyses, (row) => row.idempotencyKey, "analysis request identifier");
  requireUnique(snapshot.reports, (row) => row.analysisId, "report analysis");
  requireUnique(snapshot.userResearch, (row) => row.analysisId, "user research analysis");
  requireUnique(snapshot.bets, (row) => row.submissionId, "bet submission identifier");
  assertBoardGraph(snapshot.gameBoards ?? []);
  assertExplanationGraph(snapshot.gameBoards ?? [], snapshot.explanationEvents ?? []);
}

export function assertExplanationGraph(boards: GameBoard[], events: ExplanationEvent[]): void {
  const ids = new Set<string>();
  const requestIds = new Set<string>();
  const attempts = new Map<string, string>();
  const histories = new Map<string, ExplanationEvent[]>();
  for (const event of [...events].sort(
    (a, b) => a.boardId.localeCompare(b.boardId) || a.sequence - b.sequence,
  )) {
    if (
      !isObject(event) ||
      typeof event.id !== "string" ||
      !UUID.test(event.id) ||
      typeof event.boardId !== "string" ||
      typeof event.attemptId !== "string" ||
      !event.attemptId.trim() ||
      !Number.isInteger(event.sequence) ||
      !Number.isFinite(Date.parse(event.recordedAt))
    )
      throw new Error("Journal backup has a malformed explanation event.");
    if (ids.has(event.id)) throw new Error(`Journal backup repeats explanation event ${event.id}.`);
    ids.add(event.id);
    const board = boards.find((item) => item.id === event.boardId);
    if (!board) throw new Error(`Explanation event ${event.id} references a missing board.`);
    const history = histories.get(board.id) ?? [];
    if (
      event.sequence !== history.length + 1 ||
      Date.parse(event.recordedAt) <
        Date.parse(history.at(-1)?.recordedAt ?? board.completedAt ?? board.createdAt)
    )
      throw new Error(`Explanation event ${event.id} has invalid chronology or sequence.`);
    const base = ["id", "boardId", "attemptId", "sequence", "recordedAt", "kind"];
    const fields: Record<string, string[]> = {
      started: ["drafter"],
      "request-intent": ["requestId", "role", "bodyHash"],
      response: ["requestId", "exchange"],
      completed: ["report"],
      failed: ["reasons"],
      ambiguous: ["reason"],
    };
    if (!fields[event.kind])
      throw new Error(`Explanation event ${event.id} has an unsupported kind.`);
    requireKnownFields(
      event,
      new Set([...base, ...fields[event.kind]!]),
      `Explanation event ${event.id}`,
    );
    if (attempts.has(event.attemptId) && attempts.get(event.attemptId) !== board.id)
      throw new Error(`Explanation attempt ${event.attemptId} belongs to another board.`);
    attempts.set(event.attemptId, board.id);
    if (
      event.kind === "started" &&
      (!isObject(event.drafter) ||
        typeof event.drafter.id !== "string" ||
        typeof event.drafter.modelId !== "string")
    )
      throw new Error(`Explanation event ${event.id} has no valid drafter.`);
    if (
      (event.kind === "request-intent" || event.kind === "response") &&
      (typeof event.requestId !== "string" || !event.requestId.trim())
    )
      throw new Error(`Explanation event ${event.id} has no request identity.`);
    if (event.kind === "request-intent") {
      if (!["original", "repair"].includes(event.role) || requestIds.has(event.requestId))
        throw new Error(`Explanation event ${event.id} repeats a request identity or role.`);
      requestIds.add(event.requestId);
    }
    if (
      event.kind === "response" &&
      (!isObject(event.exchange) ||
        !["draft", "repair"].includes(event.exchange.role) ||
        !["completed", "failed", "ambiguous"].includes(event.exchange.outcome) ||
        typeof event.exchange.requestId !== "string" ||
        !event.exchange.requestId.trim() ||
        typeof event.exchange.costKnown !== "boolean" ||
        !("response" in event.exchange) ||
        ["promptTokens", "completionTokens", "totalTokens", "costUsd"].some((key) => {
          const value = event.exchange[key as keyof ProviderRequestRecord];
          return (
            value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)
          );
        }) ||
        (event.exchange.costKnown && event.exchange.costUsd === null))
    )
      throw new Error(`Explanation event ${event.id} has a malformed response.`);
    if (
      event.kind === "failed" &&
      (!Array.isArray(event.reasons) ||
        !event.reasons.length ||
        event.reasons.some((reason) => typeof reason !== "string" || !reason.trim()))
    )
      throw new Error(`Explanation event ${event.id} has no failure reason.`);
    if (event.kind === "ambiguous" && (typeof event.reason !== "string" || !event.reason.trim()))
      throw new Error(`Explanation event ${event.id} has no ambiguous reason.`);
    if (
      event.kind === "completed" &&
      (!isObject(event.report) || explanationShapeProblems(event.report).length > 0)
    )
      throw new Error(`Explanation event ${event.id} has no report.`);
    const { id: _id, sequence: _sequence, recordedAt: _at, ...command } = event;
    const result = decideExplanationWrite(board, history, command as ExplanationCommand);
    if (result.kind !== "acquired")
      throw new Error(
        `Explanation event ${event.id} has an invalid transition${result.kind === "conflict" ? `: ${result.error}` : "."}`,
      );
    history.push(event);
    histories.set(board.id, history);
  }
}

function requireUnique<T>(rows: T[], key: (row: T) => string | null, label: string): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = key(row);
    if (value === null) continue;
    if (seen.has(value)) throw new Error(`Journal backup repeats ${label} ${value}.`);
    seen.add(value);
  }
}

/** Frozen roles keep their stored shape, and one game has one primary assessment. */
function assertAssessmentRoles(analyses: AnalysisRecord[]): void {
  const primaries = new Set<string>();
  for (const analysis of analyses) {
    const role = analysis.assessmentRole;
    if (role === null) continue;
    if (
      !["primary", "refresh", "ineligible"].includes(role) ||
      (role === "refresh") !== (analysis.primaryAnalysisId !== null)
    ) {
      throw new Error(`Analysis ${analysis.id} has a malformed assessment role.`);
    }
    if (role !== "primary") continue;
    const game = analysis.snapshot.game?.sourceGameId;
    if (primaries.has(game)) {
      throw new Error(`Journal backup has more than one primary assessment for game ${game}.`);
    }
    primaries.add(game);
  }
}

/**
 * Board and pick identifiers are unique, a refresh names a board in the file without a cycle, and
 * one game and market has one primary model pick.
 */
function assertBoardGraph(boards: GameBoard[]): void {
  const boardIds = new Set<string>();
  const pickIds = new Set<string>();
  const primaries = new Set<string>();
  for (const board of boards) {
    if (boardIds.has(board.id)) throw new Error(`Journal backup repeats game board ${board.id}.`);
    boardIds.add(board.id);
    for (const market of board.markets) {
      const pick = market.pick;
      if (!pick) continue;
      if (pickIds.has(pick.id)) throw new Error(`Journal backup repeats model pick ${pick.id}.`);
      pickIds.add(pick.id);
      if (pick.boardId !== board.id || pick.market !== market.market) {
        throw new Error(`Model pick ${pick.id} does not belong to its board market.`);
      }
      if (pick.role?.role !== "primary") continue;
      const key = `${board.game.id}/${market.market}`;
      if (primaries.has(key)) {
        throw new Error(`Journal backup has more than one primary model pick for ${key}.`);
      }
      primaries.add(key);
    }
  }
  requireUnique(boards, (board) => board.request.id, "game board submission identifier");
  for (const board of boards) {
    if (board.parentId && !boardIds.has(board.parentId)) {
      throw new Error(`Game board ${board.id} is missing its parent board.`);
    }
    for (const market of board.markets) {
      const parentPick = market.pick?.parentPickId;
      if (parentPick && !pickIds.has(parentPick)) {
        throw new Error(`Model pick ${market.pick!.id} is missing its parent pick.`);
      }
    }
  }
  if (hasCycle(boards)) throw new Error("Game board parent relationships contain a cycle.");
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

/**
 * The bytes of a backup file. The whole graph is decoded first, so a file is always restorable
 * and the same journal always writes the same bytes. Only version 1 record lists are written:
 * settings and credentials have no list. Saved records are immutable, so a record holding a
 * secret rejects the export with its path rather than being rewritten into a backup that no
 * longer matches the journal.
 */
export function encodeJournalBackup(
  backup: JournalExport,
  options: { secrets: readonly string[] },
): string {
  const file = decodeJournalBackup(
    Object.fromEntries(
      ["version", ...BACKUP_COLLECTIONS]
        .filter((field) => (backup as Record<string, unknown>)[field] !== undefined)
        .map((field) => [field, (backup as Record<string, unknown>)[field]]),
    ),
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
