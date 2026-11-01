import { createHash } from "node:crypto";
import { americanToDecimal } from "#lib/domain/odds.ts";
import type { GameBoard } from "./board-store.ts";
import type {
  AnalysisRecord,
  BetContract,
  BetRecord,
  ClosingRecord,
  EvidenceRecord,
  GameRecord,
  JournalExport,
  OfferRecord,
  ReportRecord,
  SettlementNoticeRecord,
  UserResearchRecord,
} from "./journal-backup.ts";
import { sameRecord } from "./journal-backup.ts";
import {
  betFingerprint,
  closingSubjectColumns,
  gameRecord,
  pickBetOffer,
  recordsFromRun,
} from "./journal-records.ts";
import type { ActualBet, ClosingObservation, ResearchRun, RunGame, StoredNotice } from "./store.ts";

/**
 * Input-only decoding of memory journal backups written before the memory journal stored
 * version 1 records. Those files kept four private lists beside empty version 1 lists. Nothing
 * writes this layout any more.
 */
export const MEMORY_V1_FIELDS = ["runs", "actualBets", "closingObservations", "notices"] as const;

const RUN_FIELDS = new Set<string>([
  "id",
  "request",
  "parentId",
  "snapshotVersion",
  "snapshotProvenance",
  "cutoffAt",
  "status",
  "stages",
  "game",
  "offer",
  "lean",
  "evidence",
  "evidencePacketHash",
  "gaps",
  "usage",
  "providerRequests",
  "providerOutcomeAmbiguous",
  "report",
  "renderedText",
  "failureReason",
  "policy",
  "probabilityModel",
  "forecast",
  "provider",
  "model",
  "createdAt",
  "completedAt",
  "assessmentRole",
] satisfies (keyof ResearchRun)[]);

const GAME_FIELDS = new Set<string>([
  "id",
  "season",
  "week",
  "home",
  "away",
  "kickoff",
  "venue",
] satisfies (keyof RunGame)[]);

/** A memory bet also carried its game, derived from its analysis or model pick. */
type MemoryBet = ActualBet & { game?: { id: string; kickoff: string } };

// The earliest layout had no model pick and no game on a bet, and no game on a notice.
const BET_FIELDS = new Set<string>([
  "id",
  "analysisId",
  "modelPickId",
  "submissionId",
  "contractProvenance",
  "sportsbook",
  "market",
  "selection",
  "pointLine",
  "rules",
  "americanOdds",
  "stakeUnits",
  "placedAt",
  "game",
] satisfies (keyof MemoryBet)[]);

const CLOSING_FIELDS = new Set<string>([
  "id",
  "subject",
  "provenance",
  "sportsbook",
  "market",
  "selection",
  "pointLine",
  "rules",
  "americanOdds",
  "observedAt",
  "source",
  "comparison",
] satisfies (keyof ClosingObservation)[]);

const NOTICE_FIELDS = new Set<string>([
  "id",
  "eventId",
  "analysisId",
  "gameId",
  "betId",
  "kind",
  "homeScore",
  "awayScore",
  "source",
  "reason",
  "correctsId",
  "recordedAt",
  "payloadKey",
] satisfies (keyof StoredNotice)[]);

const TECHNICAL_ID_NAMESPACE = Buffer.from("6f1c8a523d0e4f7b9a412c5e7d9b0f13", "hex");

/**
 * A name-based (version 5) UUID for a storage row the memory layout never had, such as the
 * offer row of an analysis. It is derived from that record's own identity, so the same file
 * always decodes to the same rows. It is storage identity only and establishes no fact.
 */
export function technicalId(kind: string, stableId: string): string {
  const hash = createHash("sha1")
    .update(TECHNICAL_ID_NAMESPACE)
    .update(`memory-v1:${kind}:${stableId}`)
    .digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type Decoded = Pick<
  JournalExport,
  | "games"
  | "offers"
  | "evidence"
  | "analyses"
  | "reports"
  | "userResearch"
  | "bets"
  | "closings"
  | "settlementNotices"
  | "gameSettlementNotices"
>;

/**
 * Version 1 records for a memory backup's private lists. A record the layout holds but version 1
 * cannot store without inventing a fact is refused with its identifier.
 */
export function decodeMemoryV1(file: Record<string, unknown>): Decoded {
  const runs = list(file.runs, "runs").map(parseRun);
  const bets = list(file.actualBets ?? [], "actualBets").map((value) =>
    requireShape(value, BET_FIELDS, "memory bet"),
  ) as unknown as MemoryBet[];
  const closings = list(file.closingObservations ?? [], "closingObservations").map((value) =>
    requireShape(value, CLOSING_FIELDS, "memory closing observation"),
  ) as unknown as ClosingObservation[];
  const notices = list(file.notices ?? [], "notices").map((value) =>
    requireShape(value, NOTICE_FIELDS, "memory settlement notice"),
  ) as unknown as StoredNotice[];
  const boards = Array.isArray(file.gameBoards) ? (file.gameBoards as GameBoard[]) : [];

  // A game row holds the latest schedule saved for it; each snapshot keeps its own copy.
  const games = new Map<string, GameRecord>();
  for (const run of [...runs].sort(
    (left, right) => left.createdAt.localeCompare(right.createdAt) || (left.id < right.id ? -1 : 1),
  )) {
    games.set(run.game.id, gameRecord(technicalId("game", run.game.id), run.game));
  }

  const offers: OfferRecord[] = [];
  const evidence: EvidenceRecord[] = [];
  const analyses: AnalysisRecord[] = [];
  const reports: ReportRecord[] = [];
  const userResearch: UserResearchRecord[] = [];
  const runById = new Map<string, ResearchRun>();
  for (const run of runs) {
    const records = recordsFromRun(run, {
      game: games.get(run.game.id)!.id,
      offer: technicalId("offer", run.id),
      evidence: (position) => technicalId("evidence", `${run.id}/${position}`),
      report: technicalId("report", run.id),
      userResearch: technicalId("user-research", run.id),
    });
    runById.set(run.id, run);
    offers.push(records.offer);
    evidence.push(...records.evidence);
    analyses.push(records.analysis);
    if (records.report) reports.push(records.report);
    if (records.userResearch) userResearch.push(records.userResearch);
  }

  const boardOfPick = new Map<string, GameBoard>();
  for (const board of boards) {
    for (const market of board.markets ?? []) {
      if (market.pick) boardOfPick.set(market.pick.id, board);
    }
  }
  const betRecords = bets.map((bet): BetRecord => {
    const analysisId = bet.analysisId ?? null;
    const modelPickId = bet.modelPickId ?? null;
    if (!analysisId === !modelPickId) {
      throw new Error(`Memory bet ${bet.id} must belong to one analysis or one model pick.`);
    }
    if (bet.contractProvenance !== "captured" && bet.contractProvenance !== "legacy-unknown") {
      throw new Error(`Memory bet ${bet.id} has an unknown contract provenance.`);
    }
    const contract: BetContract | null =
      bet.contractProvenance === "captured"
        ? {
            market: bet.market!,
            selection: bet.selection!,
            pointLine: bet.pointLine,
            rules: bet.rules!,
          }
        : null;
    let offerId: string;
    let sourceGameId: string;
    if (analysisId) {
      const run = runById.get(analysisId);
      if (!run) throw new Error(`Memory bet ${bet.id} is missing its analysis.`);
      offerId = technicalId("offer", run.id);
      sourceGameId = run.game.id;
    } else {
      const board = boardOfPick.get(modelPickId!);
      if (!board) throw new Error(`Memory bet ${bet.id} is missing its model pick.`);
      if (!contract) {
        throw new Error(
          `Memory bet ${bet.id} from a model pick has no placed contract. Version 1 stores that bet through its contract and cannot invent one.`,
        );
      }
      sourceGameId = board.game.id;
      if (!games.has(sourceGameId)) {
        games.set(sourceGameId, gameRecord(technicalId("game", sourceGameId), board.game));
      }
      const offer = pickBetOffer({
        id: technicalId("bet-offer", bet.id),
        gameId: games.get(sourceGameId)!.id,
        kickoffAt: board.game.kickoff,
        sportsbook: bet.sportsbook,
        contract,
        americanOdds: bet.americanOdds,
        placedAt: bet.placedAt,
      });
      offers.push(offer);
      offerId = offer.id;
    }
    if (bet.game !== undefined && bet.game?.id !== sourceGameId) {
      throw new Error(`Memory bet ${bet.id} names a game other than its analysis or model pick.`);
    }
    return {
      id: bet.id,
      offerId,
      analysisId,
      modelPickId,
      submissionId: bet.submissionId,
      contract,
      contractFingerprint: contract
        ? betFingerprint(
            analysisId ?? undefined,
            modelPickId ?? undefined,
            { ...contract, sportsbook: bet.sportsbook, americanOdds: bet.americanOdds },
            bet.stakeUnits,
            bet.placedAt,
          )
        : null,
      americanOdds: bet.americanOdds,
      decimalOdds: americanToDecimal(bet.americanOdds),
      placedAt: timestamp(bet.placedAt),
      stakeUnits: bet.stakeUnits,
      sportsbook: bet.sportsbook,
    };
  });

  const closingRecords = closings.map((closing): ClosingRecord => ({
    id: closing.id,
    ...closingSubjectColumns(closing.subject),
    provenance: closing.provenance,
    sportsbook: closing.sportsbook,
    market: closing.market,
    selection: closing.selection,
    pointLine: closing.pointLine,
    rules: closing.rules,
    americanOdds: closing.americanOdds,
    decimalOdds: americanToDecimal(closing.americanOdds),
    observedAt: closing.observedAt === null ? null : timestamp(closing.observedAt),
    source: closing.source,
  }));

  const settlementNotices: SettlementNoticeRecord[] = [];
  const gameNotices = new Map<string, StoredNotice>();
  for (const notice of list(file.gameSettlementNotices ?? [], "gameSettlementNotices")) {
    const row = notice as StoredNotice;
    gameNotices.set(row.id, row);
  }
  for (const { gameId, ...notice } of notices) {
    if (gameId === undefined || gameId === null) {
      settlementNotices.push(notice);
      continue;
    }
    const listed = gameNotices.get(notice.id);
    const stored = { ...notice, gameId };
    if (listed && !sameRecord(listed, stored)) {
      throw new Error(`Memory game settlement notice ${notice.id} disagrees with its game list.`);
    }
    gameNotices.set(notice.id, stored);
  }

  return {
    games: [...games.values()],
    offers,
    evidence,
    analyses,
    reports,
    userResearch,
    bets: betRecords,
    closings: closingRecords,
    settlementNotices,
    gameSettlementNotices: [...gameNotices.values()],
  };
}

function parseRun(value: unknown): ResearchRun {
  const run = requireShape(value, RUN_FIELDS, "memory analysis", true);
  const game = run.game;
  if (typeof game !== "object" || game === null) {
    throw new Error(`Memory analysis ${String(run.id)} is missing its game.`);
  }
  requireShape(game, GAME_FIELDS, `memory analysis ${String(run.id)} game`, true);
  if (typeof run.offer !== "object" || run.offer === null || !Array.isArray(run.evidence)) {
    throw new Error(`Memory analysis ${String(run.id)} is missing its offer or evidence.`);
  }
  if (typeof run.createdAt !== "string" || typeof run.cutoffAt !== "string") {
    throw new Error(`Memory analysis ${String(run.id)} has a malformed timestamp.`);
  }
  return run as unknown as ResearchRun;
}

function requireShape(
  value: unknown,
  fields: ReadonlySet<string>,
  label: string,
  complete = false,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Journal backup has a malformed ${label}.`);
  }
  const record = value as Record<string, unknown>;
  const name = typeof record.id === "string" ? `${label} ${record.id}` : label;
  for (const key of Object.keys(record)) {
    if (!fields.has(key))
      throw new Error(`Journal backup ${name} has an unsupported field "${key}".`);
  }
  if (complete) {
    for (const key of fields) {
      if (!(key in record)) throw new Error(`Journal backup ${name} is missing "${key}".`);
    }
  }
  return record;
}

function list(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Journal backup list "${name}" is not a list.`);
  return value;
}

/** A timestamp column's form. An unreadable value is left for record validation to reject. */
function timestamp(value: string): string {
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : value;
}
