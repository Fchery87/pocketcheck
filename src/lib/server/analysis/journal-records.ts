import { createHash } from "node:crypto";
import { americanToDecimal } from "#lib/domain/odds.ts";
import type { ThesisReport } from "../providers/contracts.ts";
import type { EvidenceFacts, EvidenceItem } from "../sources/contracts.ts";
import type { SavedForecast } from "./forecast-record.ts";
import type {
  AnalysisRecord,
  BetContract,
  BetRecord,
  ClosingRecord,
  EvidenceRecord,
  GameRecord,
  OfferRecord,
  ReportRecord,
  UserResearchRecord,
} from "./journal-backup.ts";
import type { RunModel } from "./model.ts";
import type { PolicyDecision } from "./policy.ts";
import type {
  ActualBet,
  AssessmentRole,
  ClosingSubject,
  ProgressStage,
  ResearchRun,
  RunGame,
  RunUsage,
} from "./store.ts";

/**
 * Conversions between the journal's working views (a research run, an actual bet, a closing
 * subject) and version 1 records. Both journals store version 1 records, so one mapping serves
 * them and the decoder for older memory backups.
 */

/** The game status both journals write. A game record holds no observed status of its own. */
export const RECORDED_GAME_STATUS = "scheduled";

/** A timestamp as a timestamp column returns it. */
export function instant(value: string): string {
  return new Date(value).toISOString();
}

export function instantOrNull(value: string | null): string | null {
  return value === null ? null : instant(value);
}

/** What an evidence row's body holds, so the packet item comes back unchanged. */
type EvidenceBody = {
  facts: EvidenceFacts;
  excerpt: string | null;
  factKey: string | null;
  checksum: string | null;
};

export type EvidenceFields = Omit<EvidenceRecord, "id" | "completedAt">;

export function evidenceFields(item: EvidenceItem): EvidenceFields {
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

export function evidenceItem(record: EvidenceRecord): EvidenceItem {
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

export function toRunGame(game: GameRecord): RunGame {
  return {
    id: game.sourceGameId,
    season: game.season,
    week: game.week,
    home: game.homeTeam,
    away: game.awayTeam,
    kickoff: instant(game.kickoffAt),
    venue: game.venue,
  };
}

export function gameRecord(id: string, game: RunGame): GameRecord {
  return {
    id,
    sourceGameId: game.id,
    season: game.season,
    week: game.week,
    awayTeam: game.away,
    homeTeam: game.home,
    kickoffAt: instant(game.kickoff),
    venue: game.venue,
    status: RECORDED_GAME_STATUS,
  };
}

export function storedAssessmentRole(analysis: {
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

/** An unclassified role has no stored columns. Reading it back gives no frozen role. */
export function roleColumns(
  role: AssessmentRole | null,
): Pick<AnalysisRecord, "assessmentRole" | "assessmentRoleReason" | "primaryAnalysisId"> {
  if (!role || role.role === "unclassified") {
    return { assessmentRole: null, assessmentRoleReason: null, primaryAnalysisId: null };
  }
  return {
    assessmentRole: role.role,
    assessmentRoleReason: role.reason,
    primaryAnalysisId: role.role === "refresh" ? role.primaryId : null,
  };
}

/** The records one analysis owns, with its evidence in packet order. */
export type AnalysisRecords = {
  analysis: AnalysisRecord;
  evidence: EvidenceRecord[];
  report: ReportRecord | null;
  userResearch: UserResearchRecord | null;
};

/** The run a set of analysis records describes, with the status exactly as stored. */
export function runFromRecords(records: AnalysisRecords): ResearchRun {
  const { analysis, report, userResearch, evidence } = records;
  const { game, offer } = analysis.snapshot;
  return {
    id: analysis.id,
    request: analysis.snapshot.request ?? null,
    parentId: analysis.parentId,
    snapshotVersion: analysis.snapshot.version,
    snapshotProvenance: analysis.snapshot.provenance,
    cutoffAt: analysis.cutoffAt,
    status: analysis.status,
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
      observedAt: instant(offer.observedAt),
      kickoffAt: instant(offer.kickoffAt),
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

/** The analysis columns a later save of an unfinished attempt may change. */
export function mutableAnalysisColumns(
  run: Pick<
    ResearchRun,
    | "status"
    | "policy"
    | "report"
    | "evidencePacketHash"
    | "provider"
    | "model"
    | "failureReason"
    | "stages"
    | "gaps"
    | "usage"
    | "probabilityModel"
  >,
) {
  return {
    status: run.status,
    conclusion: run.policy?.conclusion ?? run.report?.conclusion ?? null,
    policyVersion: run.policy?.policyVersion ?? null,
    evidencePacketHash: run.evidencePacketHash,
    provider: run.provider,
    model: run.model,
    failureReason: run.failureReason,
    policy: run.policy ?? null,
    stages: run.stages ?? null,
    gaps: run.gaps ?? null,
    usage: run.usage ?? null,
    probabilityModel: run.probabilityModel ?? null,
  } satisfies Partial<AnalysisRecord>;
}

export type AnalysisRecordIds = {
  game: string;
  offer: string;
  evidence: (position: number) => string;
  report: string;
  userResearch: string;
};

/** Every record of one analysis, together with its game record. */
export type AnalysisGraph = AnalysisRecords & { game: GameRecord; offer: OfferRecord };

/**
 * The records a run's saved fields establish. Completion times on the offer, evidence, and report
 * come from the run's own completion. A run that holds something version 1 has no place for is
 * refused, never filled in.
 */
export function recordsFromRun(run: ResearchRun, ids: AnalysisRecordIds): AnalysisGraph {
  const completedAt = run.status === "completed" ? instantOrNull(run.completedAt) : null;
  if (run.report && run.completedAt === null) {
    throw new Error(
      `Analysis ${run.id} has a report without a completion time. Version 1 cannot store it without inventing one.`,
    );
  }
  if (!run.report && run.renderedText) {
    throw new Error(
      `Analysis ${run.id} has rendered text without its report. Version 1 stores rendered text only with a report.`,
    );
  }
  const game = gameRecord(ids.game, run.game);
  const offer: OfferRecord = {
    id: ids.offer,
    gameId: ids.game,
    sportsbook: run.offer.sportsbook,
    market: run.offer.market,
    selection: run.offer.selection,
    pointLine: run.offer.pointLine,
    americanOdds: run.offer.americanOdds,
    decimalOdds: run.offer.decimalOdds,
    observedAt: instant(run.offer.observedAt),
    enteredAt: instant(run.cutoffAt),
    kickoffAt: instant(run.offer.kickoffAt),
    rules: run.offer.rules,
    opposing: run.offer.opposing ?? null,
    completedAt,
  };
  const evidence = run.evidence.map((item, position) =>
    evidenceRecord(item, ids.evidence(position), completedAt),
  );
  const analysis: AnalysisRecord = {
    id: run.id,
    offerId: ids.offer,
    parentId: run.parentId,
    snapshot: {
      version: 1,
      provenance: run.snapshotProvenance,
      game: { ...game, kickoffAt: run.game.kickoff },
      offer: {
        ...offer,
        observedAt: run.offer.observedAt,
        enteredAt: run.cutoffAt,
        kickoffAt: run.offer.kickoffAt,
      },
      ...(run.request ? { request: run.request } : {}),
      providerRequests: run.providerRequests,
      providerOutcomeAmbiguous: run.providerOutcomeAmbiguous,
      ...(run.forecast ? { forecast: run.forecast } : {}),
    },
    cutoffAt: instant(run.cutoffAt),
    ...mutableAnalysisColumns(run),
    methodVersion: null,
    schemaVersion: null,
    promptVersion: null,
    idempotencyKey: run.request?.id ?? null,
    completedAt: instantOrNull(run.completedAt),
    createdAt: instant(run.createdAt),
    evidenceIds: evidence.map((item) => item.id),
    ...roleColumns(run.assessmentRole),
  };
  const report = run.report
    ? reportRecord(ids.report, run.id, run.report, run.renderedText, run.completedAt!)
    : null;
  const userResearch: UserResearchRecord | null = run.lean
    ? {
        id: ids.userResearch,
        analysisId: run.id,
        lean: run.lean.text,
        rationale: run.lean.rationale,
      }
    : null;
  return { game, offer, analysis, evidence, report, userResearch };
}

export function evidenceRecord(
  item: EvidenceItem,
  id: string,
  completedAt: string | null,
): EvidenceRecord {
  return {
    ...evidenceFields(item),
    id,
    retrievedAt: instant(item.retrievedAt),
    publishedAt: item.publishedAt === "unknown" ? null : instant(item.publishedAt),
    completedAt,
  };
}

export function reportRecord(
  id: string,
  analysisId: string,
  report: ThesisReport,
  renderedText: string,
  completedAt: string,
): ReportRecord {
  return {
    id,
    analysisId,
    claims: report.claims,
    thesis: report.summary,
    usage: null,
    renderedText,
    completedAt: instant(completedAt),
    body: report,
  };
}

export function betFromRecord(record: BetRecord): ActualBet {
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

/** Identifies a submission's inputs, so a repeat with changed terms is a conflict. */
export function betFingerprint(
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

/** The offer a bet from a model pick is placed at, as its own record on the pick's game. */
export function pickBetOffer(input: {
  id: string;
  gameId: string;
  kickoffAt: string;
  sportsbook: string;
  contract: BetContract;
  americanOdds: number;
  placedAt: string;
}): OfferRecord {
  return {
    id: input.id,
    gameId: input.gameId,
    sportsbook: input.sportsbook,
    market: input.contract.market,
    selection: input.contract.selection,
    pointLine: input.contract.pointLine,
    americanOdds: input.americanOdds,
    decimalOdds: americanToDecimal(input.americanOdds),
    observedAt: instant(input.placedAt),
    enteredAt: instant(input.placedAt),
    kickoffAt: instant(input.kickoffAt),
    rules: input.contract.rules,
    opposing: null,
    completedAt: instant(input.placedAt),
  };
}

export function closingSubject(record: ClosingRecord): ClosingSubject {
  if (record.modelPickId) return { kind: "model-pick", id: record.modelPickId };
  if (record.analysisId) return { kind: "analysis", id: record.analysisId };
  return { kind: "bet", id: record.betId! };
}

export function closingSubjectColumns(
  subject: ClosingSubject,
): Pick<ClosingRecord, "analysisId" | "betId" | "modelPickId"> {
  return {
    analysisId: subject.kind === "analysis" ? subject.id : null,
    betId: subject.kind === "bet" ? subject.id : null,
    modelPickId: subject.kind === "model-pick" ? subject.id : null,
  };
}
