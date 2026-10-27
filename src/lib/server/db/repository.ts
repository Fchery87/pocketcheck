import { randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import type { AttemptRequest } from "../analysis/attempt.ts";
import type { SavedForecast } from "../analysis/forecast-record.ts";
import type { ProviderRequestRecord } from "../providers/contracts.ts";
import { americanToDecimal } from "#lib/domain/odds.ts";
import type { Offer } from "#lib/domain/offer.ts";
import type { Settlement as SettlementResult } from "#lib/domain/settlement.ts";
import { parentsFirst } from "./order.ts";

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
  analysisId: string;
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
};

export type SaveAnalysisInput = {
  game: Omit<GameRecord, "id"> & { id?: string };
  offer: Omit<OfferRecord, "id" | "decimalOdds" | "completedAt"> & {
    id?: string;
    decimalOdds?: number;
  };
  evidence: Array<
    Omit<EvidenceRecord, "id" | "completedAt" | "packetItemId"> & {
      id?: string;
      packetItemId?: string | null;
    }
  >;
  analysis: {
    id?: string;
    parentId?: string | null;
    cutoffAt: string;
    status: AnalysisRecord["status"];
    conclusion?: string | null;
    methodVersion?: string | null;
    policyVersion?: string | null;
    schemaVersion?: string | null;
    promptVersion?: string | null;
    evidencePacketHash?: string | null;
    provider?: string | null;
    model?: string | null;
    failureReason?: string | null;
    idempotencyKey?: string | null;
    policy?: unknown;
    stages?: unknown;
    gaps?: unknown;
    usage?: unknown;
    probabilityModel?: unknown;
    request?: AttemptRequest;
    providerRequests?: ProviderRequestRecord[];
    providerOutcomeAmbiguous?: boolean;
    forecast?: SavedForecast | null;
  };
  report?: {
    claims: unknown;
    thesis: string;
    usage?: unknown;
    renderedText: string;
    body?: unknown;
  };
  userResearch?: {
    lean?: string | null;
    rationale?: string | null;
  };
};

function iso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return new Date(value).toISOString();
}

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : Number(value);
}

export class JournalRepository {
  private readonly sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  async saveCompletedAnalysis(input: SaveAnalysisInput) {
    if (input.analysis.idempotencyKey) {
      const existing = await this.findAnalysisByIdempotencyKey(input.analysis.idempotencyKey);
      if (existing) return { ...(await this.readRun(existing.id)), created: false };
    }

    const gameId = input.game.id ?? randomUUID();
    const offerId = input.offer.id ?? randomUUID();
    const analysisId = input.analysis.id ?? randomUUID();
    const evidenceIds = input.evidence.map((item) => item.id ?? randomUUID());
    const completedAt = new Date().toISOString();
    const decimalOdds = input.offer.decimalOdds ?? americanToDecimal(input.offer.americanOdds);
    const completed = input.analysis.status === "completed";

    try {
      await this.sql.begin(async (tx) => {
        await tx`
          INSERT INTO games (
            id, source_game_id, season, week, away_team, home_team, kickoff_at, venue, status
          ) VALUES (
            ${gameId}, ${input.game.sourceGameId}, ${input.game.season}, ${input.game.week},
            ${input.game.awayTeam}, ${input.game.homeTeam}, ${input.game.kickoffAt},
            ${input.game.venue}, ${input.game.status}
          )
          ON CONFLICT (source_game_id) DO UPDATE SET
            season = EXCLUDED.season,
            week = EXCLUDED.week,
            away_team = EXCLUDED.away_team,
            home_team = EXCLUDED.home_team,
            kickoff_at = EXCLUDED.kickoff_at,
            venue = EXCLUDED.venue,
            status = EXCLUDED.status,
            updated_at = now()
        `;
        const gameRows = await tx<{ id: string }[]>`
          SELECT id FROM games WHERE source_game_id = ${input.game.sourceGameId}
        `;
        const persistedGameId = gameRows[0]?.id ?? gameId;

        const snapshot: AnalysisSnapshot = {
          version: 1,
          provenance: "captured",
          game: {
            id: persistedGameId,
            sourceGameId: input.game.sourceGameId,
            season: input.game.season,
            week: input.game.week,
            awayTeam: input.game.awayTeam,
            homeTeam: input.game.homeTeam,
            kickoffAt: input.game.kickoffAt,
            venue: input.game.venue,
            status: input.game.status,
          },
          offer: {
            id: offerId,
            gameId: persistedGameId,
            sportsbook: input.offer.sportsbook,
            market: input.offer.market,
            selection: input.offer.selection,
            pointLine: input.offer.pointLine,
            americanOdds: input.offer.americanOdds,
            decimalOdds,
            observedAt: input.offer.observedAt,
            enteredAt: input.offer.enteredAt,
            kickoffAt: input.offer.kickoffAt,
            rules: input.offer.rules,
            opposing: input.offer.opposing,
            completedAt: completed ? completedAt : null,
          },
          ...(input.analysis.request ? { request: input.analysis.request } : {}),
          providerRequests: input.analysis.providerRequests ?? [],
          providerOutcomeAmbiguous: input.analysis.providerOutcomeAmbiguous ?? false,
          ...(input.analysis.forecast ? { forecast: input.analysis.forecast } : {}),
        };

        await tx`
          INSERT INTO offers (
            id, game_id, sportsbook, market, selection, point_line, american_odds, decimal_odds,
            observed_at, entered_at, kickoff_at, rules, opposing, completed_at
          ) VALUES (
            ${offerId}, ${persistedGameId}, ${input.offer.sportsbook}, ${input.offer.market},
            ${input.offer.selection}, ${input.offer.pointLine}, ${input.offer.americanOdds},
            ${decimalOdds}, ${input.offer.observedAt}, ${input.offer.enteredAt},
            ${input.offer.kickoffAt}, ${tx.json(input.offer.rules as never)},
            ${input.offer.opposing ? tx.json(input.offer.opposing as never) : null},
            ${completed ? completedAt : null}
          )
        `;

        const terminal =
          input.analysis.status === "completed" ||
          input.analysis.status === "failed" ||
          input.analysis.status === "interrupted";
        const role = terminal
          ? await chooseAssessmentRole(tx, {
              analysisId,
              status: input.analysis.status,
              cutoffAt: input.analysis.cutoffAt,
              gameId: input.game.sourceGameId,
              kickoffAt: input.game.kickoffAt,
            })
          : null;
        await tx`
          INSERT INTO analyses (
            id, offer_id, parent_id, cutoff_at, status, conclusion,
            method_version, policy_version, schema_version, prompt_version,
            evidence_packet_hash, provider, model, failure_reason, idempotency_key, completed_at,
            policy, stages, gaps, usage, probability_model, snapshot,
            assessment_role, assessment_role_reason, primary_analysis_id
          ) VALUES (
            ${analysisId}, ${offerId}, ${input.analysis.parentId ?? null}, ${input.analysis.cutoffAt},
            ${input.analysis.status}, ${input.analysis.conclusion ?? null},
            ${input.analysis.methodVersion ?? null}, ${input.analysis.policyVersion ?? null},
            ${input.analysis.schemaVersion ?? null}, ${input.analysis.promptVersion ?? null},
            ${input.analysis.evidencePacketHash ?? null}, ${input.analysis.provider ?? null},
            ${input.analysis.model ?? null}, ${input.analysis.failureReason ?? null},
            ${input.analysis.idempotencyKey ?? null},
            ${completed ? completedAt : null},
            ${jsonOrNull(tx, input.analysis.policy)}, ${jsonOrNull(tx, input.analysis.stages)},
            ${jsonOrNull(tx, input.analysis.gaps)}, ${jsonOrNull(tx, input.analysis.usage)},
            ${jsonOrNull(tx, input.analysis.probabilityModel)}, ${tx.json(snapshot as never)},
            ${role?.role ?? null}, ${role?.reason ?? null}, ${role?.primaryId ?? null}
          )
        `;

        for (let index = 0; index < input.evidence.length; index += 1) {
          const item = input.evidence[index]!;
          await tx`
            INSERT INTO evidence (
              id, source_id, source_url, retrieved_at, published_at, effective_at,
              checksum, body, origin, completeness, completed_at, packet_item_id
            ) VALUES (
              ${evidenceIds[index]}, ${item.sourceId}, ${item.sourceUrl}, ${item.retrievedAt},
              ${item.publishedAt}, ${item.effectiveAt}, ${item.checksum},
              ${tx.json(item.body as never)}, ${item.origin}, ${item.completeness},
              ${completed ? completedAt : null}, ${item.packetItemId ?? null}
            )
          `;
          await tx`
            INSERT INTO analysis_evidence (analysis_id, evidence_id, completeness, position)
            VALUES (${analysisId}, ${evidenceIds[index]}, ${item.completeness}, ${index})
          `;
        }

        if (input.report) {
          await tx`
            INSERT INTO reports (id, analysis_id, claims, thesis, usage, rendered_bytes, completed_at, body)
            VALUES (
              ${randomUUID()}, ${analysisId}, ${tx.json(input.report.claims as never)},
              ${input.report.thesis},
              ${input.report.usage ? tx.json(input.report.usage as never) : null},
              ${Buffer.from(input.report.renderedText, "utf8")}, ${completedAt},
              ${jsonOrNull(tx, input.report.body)}
            )
          `;
        }

        if (input.userResearch) {
          await tx`
            INSERT INTO user_research (id, analysis_id, lean, rationale)
            VALUES (
              ${randomUUID()}, ${analysisId},
              ${input.userResearch.lean ?? null}, ${input.userResearch.rationale ?? null}
            )
          `;
        }
      });
    } catch (error) {
      if (input.analysis.idempotencyKey && isUniqueViolation(error)) {
        const existing = await this.findAnalysisByIdempotencyKey(input.analysis.idempotencyKey);
        if (existing) return { ...(await this.readRun(existing.id)), created: false };
      }
      throw error;
    }

    return { ...(await this.readRun(analysisId)), created: true };
  }

  async updateAnalysisProgress(input: SaveAnalysisInput) {
    const analysisId = input.analysis.id;
    const requestId = input.analysis.idempotencyKey;
    const requestHash = input.analysis.request?.hash;
    if (!analysisId || !requestId || !requestHash) throw new Error("Attempt identity is required");
    const existing = await this.findAnalysisByIdempotencyKey(requestId);
    if (!existing || existing.id !== analysisId)
      throw new Error(`Analysis not found: ${analysisId}`);
    if (existing.snapshot.request?.hash !== requestHash) {
      throw new Error("An attempt update cannot change its request identity or inputs.");
    }
    if (existing.completedAt) return this.readRun(analysisId);

    await this.sql.begin(async (tx) => {
      await tx`
        UPDATE analyses SET
          status = ${input.analysis.status},
          conclusion = ${input.analysis.conclusion ?? null},
          policy_version = ${input.analysis.policyVersion ?? null},
          evidence_packet_hash = ${input.analysis.evidencePacketHash ?? null},
          provider = ${input.analysis.provider ?? null},
          model = ${input.analysis.model ?? null},
          failure_reason = ${input.analysis.failureReason ?? null},
          policy = ${jsonOrNull(tx, input.analysis.policy)},
          stages = ${jsonOrNull(tx, input.analysis.stages)},
          gaps = ${jsonOrNull(tx, input.analysis.gaps)},
          usage = ${jsonOrNull(tx, input.analysis.usage)},
          probability_model = ${jsonOrNull(tx, input.analysis.probabilityModel)},
          snapshot = snapshot || ${tx.json({
            providerRequests: input.analysis.providerRequests ?? [],
            providerOutcomeAmbiguous: input.analysis.providerOutcomeAmbiguous ?? false,
            ...(input.analysis.forecast ? { forecast: input.analysis.forecast } : {}),
          } as never)}
        WHERE id = ${analysisId} AND completed_at IS NULL
      `;
      if (input.evidence.length) {
        const linked = await tx<{ id: string }[]>`
          SELECT evidence_id AS id FROM analysis_evidence WHERE analysis_id = ${analysisId} LIMIT 1
        `;
        if (!linked[0]) {
          for (let index = 0; index < input.evidence.length; index += 1) {
            const item = input.evidence[index]!;
            const evidenceId = item.id ?? randomUUID();
            await tx`
              INSERT INTO evidence (
                id, source_id, source_url, retrieved_at, published_at, effective_at,
                checksum, body, origin, completeness, completed_at, packet_item_id
              ) VALUES (
                ${evidenceId}, ${item.sourceId}, ${item.sourceUrl}, ${item.retrievedAt},
                ${item.publishedAt}, ${item.effectiveAt}, ${item.checksum},
                ${tx.json(item.body as never)}, ${item.origin}, ${item.completeness}, NULL,
                ${item.packetItemId ?? null}
              )
            `;
            await tx`
              INSERT INTO analysis_evidence (analysis_id, evidence_id, completeness, position)
              VALUES (${analysisId}, ${evidenceId}, ${item.completeness}, ${index})
            `;
          }
        }
      }
    });
    return this.readRun(analysisId);
  }

  async completeAnalysisAttempt(input: SaveAnalysisInput) {
    const analysisId = input.analysis.id;
    const requestId = input.analysis.idempotencyKey;
    const requestHash = input.analysis.request?.hash;
    if (!analysisId || !requestId || !requestHash) throw new Error("Attempt identity is required");
    const existing = await this.findAnalysisByIdempotencyKey(requestId);
    if (!existing || existing.id !== analysisId)
      throw new Error(`Analysis not found: ${analysisId}`);
    if (existing.snapshot.request?.hash !== requestHash) {
      throw new Error("An attempt update cannot change its request identity or inputs.");
    }
    if (existing.completedAt) return this.readRun(analysisId);

    const completedAt = input.analysis.status === "completed" ? new Date().toISOString() : null;
    const evidenceIds = input.evidence.map((item) => item.id ?? randomUUID());
    const snapshot = {
      ...existing.snapshot,
      providerRequests: input.analysis.providerRequests ?? existing.snapshot.providerRequests ?? [],
      providerOutcomeAmbiguous:
        input.analysis.providerOutcomeAmbiguous ??
        existing.snapshot.providerOutcomeAmbiguous ??
        false,
      ...(input.analysis.forecast ? { forecast: input.analysis.forecast } : {}),
    };
    await this.sql.begin(async (tx) => {
      const role = await chooseAssessmentRole(tx, {
        analysisId,
        status: input.analysis.status,
        cutoffAt: existing.cutoffAt,
        gameId: existing.snapshot.game.sourceGameId,
        kickoffAt: existing.snapshot.game.kickoffAt,
      });
      const updated = await tx<{ id: string }[]>`
        UPDATE analyses SET
          status = ${input.analysis.status},
          conclusion = ${input.analysis.conclusion ?? null},
          policy_version = ${input.analysis.policyVersion ?? null},
          evidence_packet_hash = ${input.analysis.evidencePacketHash ?? null},
          provider = ${input.analysis.provider ?? null},
          model = ${input.analysis.model ?? null},
          failure_reason = ${input.analysis.failureReason ?? null},
          completed_at = ${completedAt},
          policy = ${jsonOrNull(tx, input.analysis.policy)},
          stages = ${jsonOrNull(tx, input.analysis.stages)},
          gaps = ${jsonOrNull(tx, input.analysis.gaps)},
          usage = ${jsonOrNull(tx, input.analysis.usage)},
          probability_model = ${jsonOrNull(tx, input.analysis.probabilityModel)},
          snapshot = ${tx.json(snapshot as never)},
          assessment_role = ${role.role},
          assessment_role_reason = ${role.reason},
          primary_analysis_id = ${role.primaryId}
        WHERE id = ${analysisId} AND completed_at IS NULL
        RETURNING id
      `;
      if (!updated[0]) throw new Error(`Attempt is no longer writable: ${analysisId}`);
      if (completedAt) {
        await tx`UPDATE offers SET completed_at = ${completedAt} WHERE id = ${existing.offerId} AND completed_at IS NULL`;
      }

      const linked = await tx<{ id: string }[]>`
        SELECT evidence_id AS id FROM analysis_evidence WHERE analysis_id = ${analysisId} LIMIT 1
      `;
      if (!linked[0]) {
        for (let index = 0; index < input.evidence.length; index += 1) {
          const item = input.evidence[index]!;
          await tx`
            INSERT INTO evidence (
              id, source_id, source_url, retrieved_at, published_at, effective_at,
              checksum, body, origin, completeness, completed_at, packet_item_id
            ) VALUES (
              ${evidenceIds[index]}, ${item.sourceId}, ${item.sourceUrl}, ${item.retrievedAt},
              ${item.publishedAt}, ${item.effectiveAt}, ${item.checksum},
              ${tx.json(item.body as never)}, ${item.origin}, ${item.completeness},
              ${completedAt}, ${item.packetItemId ?? null}
            )
          `;
          await tx`
            INSERT INTO analysis_evidence (analysis_id, evidence_id, completeness, position)
            VALUES (${analysisId}, ${evidenceIds[index]}, ${item.completeness}, ${index})
          `;
        }
      }
      if (completedAt) {
        await tx`
          UPDATE evidence SET completed_at = ${completedAt}
          WHERE id IN (
            SELECT evidence_id FROM analysis_evidence WHERE analysis_id = ${analysisId}
          ) AND completed_at IS NULL
        `;
      }
      if (input.report) {
        await tx`
          INSERT INTO reports (id, analysis_id, claims, thesis, usage, rendered_bytes, completed_at, body)
          VALUES (
            ${randomUUID()}, ${analysisId}, ${tx.json(input.report.claims as never)},
            ${input.report.thesis},
            ${input.report.usage ? tx.json(input.report.usage as never) : null},
            ${Buffer.from(input.report.renderedText, "utf8")}, ${completedAt},
            ${jsonOrNull(tx, input.report.body)}
          )
        `;
      }
    });
    return this.readRun(analysisId);
  }

  async readRun(analysisId: string) {
    const analysis = await this.readAnalysis(analysisId);
    if (!analysis) throw new Error(`Analysis not found: ${analysisId}`);
    return {
      game: analysis.snapshot.game,
      offer: analysis.snapshot.offer,
      evidence: await this.readEvidenceForAnalysis(analysisId),
      analysis,
      report: await this.readReport(analysisId),
      userResearch: await this.readUserResearch(analysisId),
    };
  }

  /** Like readRun, but null when the analysis does not exist. */
  async findRun(analysisId: string) {
    const rows = await this.sql<{ id: string }[]>`SELECT id FROM analyses WHERE id = ${analysisId}`;
    return rows[0] ? this.readRun(analysisId) : null;
  }

  /** One row per completed analysis with its game and offer, newest first. */
  async listCompletedSummaries() {
    const roleColumns = await this.sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'analyses'
          AND column_name = 'assessment_role'
      ) AS exists
    `;
    const roleSelect = roleColumns[0]?.exists
      ? "a.assessment_role, a.assessment_role_reason, a.primary_analysis_id, a.completed_at"
      : "NULL::text AS assessment_role, NULL::text AS assessment_role_reason, NULL::uuid AS primary_analysis_id, a.completed_at";
    const rows = await this.sql.unsafe<
      {
        id: string;
        parent_id: string | null;
        created_at: Date;
        conclusion: string;
        source_game_id: string;
        home_team: string;
        away_team: string;
        kickoff_at: Date;
        sportsbook: string;
        market: Offer["market"];
        selection: Offer["selection"];
        point_line: string | null;
        american_odds: number;
        snapshot_provenance: "captured" | "legacy-unknown";
        relies_on_manual_evidence: boolean;
        assessment_role: "primary" | "refresh" | "ineligible" | null;
        assessment_role_reason: string | null;
        primary_analysis_id: string | null;
        completed_at: Date | null;
      }[]
    >(
      `SELECT a.id, a.parent_id, a.created_at, a.conclusion,
              a.snapshot->'game'->>'sourceGameId' AS source_game_id,
              a.snapshot->'game'->>'homeTeam' AS home_team,
              a.snapshot->'game'->>'awayTeam' AS away_team,
              (a.snapshot->'game'->>'kickoffAt')::timestamptz AS kickoff_at,
              o.sportsbook, o.market, o.selection, o.point_line, o.american_odds,
              a.snapshot->>'provenance' AS snapshot_provenance,
              COALESCE((a.policy->>'reliesOnManualEvidence')::boolean, false) AS relies_on_manual_evidence,
              ${roleSelect}
       FROM analyses a
       JOIN offers o ON o.id = a.offer_id
       WHERE a.status = 'completed'
       ORDER BY a.created_at DESC`,
    );
    return rows.map((row) => ({
      id: row.id,
      parentId: row.parent_id,
      snapshotProvenance: row.snapshot_provenance,
      createdAt: iso(row.created_at)!,
      conclusion: row.conclusion,
      game: {
        id: row.source_game_id,
        home: row.home_team,
        away: row.away_team,
        kickoff: iso(row.kickoff_at)!,
      },
      offer: {
        sportsbook: row.sportsbook,
        market: row.market,
        selection: row.selection,
        pointLine: num(row.point_line),
        americanOdds: row.american_odds,
      },
      reliesOnManualEvidence: row.relies_on_manual_evidence,
      assessmentRole: listedAssessmentRole(row),
    }));
  }

  /** Only an unfinished analysis can be marked interrupted. Completed rows stay immutable. */
  async markInterrupted(analysisId: string): Promise<void> {
    await this.sql.begin(async (tx) => {
      const rows = await tx<AnalysisRow[]>`
        SELECT * FROM analyses
        WHERE id = ${analysisId} AND status NOT IN ('completed', 'interrupted', 'failed')
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) return;
      const role = await chooseAssessmentRole(tx, {
        analysisId,
        status: "interrupted",
        cutoffAt: iso(row.cutoff_at)!,
        gameId: row.snapshot.game.sourceGameId,
        kickoffAt: row.snapshot.game.kickoffAt,
      });
      await tx`
        UPDATE analyses SET
          status = 'interrupted',
          completed_at = COALESCE(completed_at, now()),
          assessment_role = ${role.role},
          assessment_role_reason = ${role.reason},
          primary_analysis_id = ${role.primaryId}
        WHERE id = ${analysisId} AND completed_at IS NULL
      `;
    });
  }

  async listBets(): Promise<BetRecord[]> {
    const rows = await this.sql<BetRow[]>`SELECT * FROM bets ORDER BY created_at ASC`;
    return rows.map(mapBet);
  }

  async recordClosing(input: {
    analysisId?: string | null;
    betId?: string | null;
    provenance?: ClosingProvenance;
    sportsbook: string;
    market: BetContract["market"];
    selection: BetContract["selection"];
    pointLine: number | null;
    rules: BetContract["rules"];
    americanOdds: number;
    observedAt: string | null;
    source: string;
  }): Promise<ClosingRecord> {
    const provenance = input.provenance ?? "observed";
    const id = randomUUID();
    await this.sql`
      INSERT INTO closing_observations (
        id, analysis_id, bet_id, provenance, sportsbook, market, selection, point_line,
        rules, american_odds, decimal_odds, observed_at, source
      ) VALUES (
        ${id}, ${input.analysisId ?? null}, ${input.betId ?? null}, ${provenance},
        ${input.sportsbook}, ${input.market}, ${input.selection}, ${input.pointLine},
        ${this.sql.json(input.rules as never)}, ${input.americanOdds},
        ${americanToDecimal(input.americanOdds)}, ${input.observedAt}, ${input.source}
      )
    `;
    const row = await this.readClosing(id);
    if (!row) throw new Error("Closing observation was not persisted");
    return row;
  }

  async listClosings(): Promise<ClosingRecord[]> {
    const rows = await this.sql<ClosingRow[]>`
      SELECT * FROM closing_observations ORDER BY created_at ASC
    `;
    return rows.map(mapClosing);
  }

  async readClosing(id: string): Promise<ClosingRecord | null> {
    const rows = await this.sql<ClosingRow[]>`SELECT * FROM closing_observations WHERE id = ${id}`;
    return rows[0] ? mapClosing(rows[0]) : null;
  }

  async findAnalysisByIdempotencyKey(key: string): Promise<AnalysisRecord | null> {
    const rows = await this.sql<{ id: string }[]>`
      SELECT id FROM analyses WHERE idempotency_key = ${key}
    `;
    return rows[0] ? this.readAnalysis(rows[0].id) : null;
  }

  async recordBet(input: {
    offerId: string;
    analysisId?: string | null;
    submissionId?: string | null;
    contract?: BetContract | null;
    contractFingerprint?: string | null;
    americanOdds: number;
    placedAt: string;
    stakeUnits: number;
    sportsbook?: string | null;
  }): Promise<BetRecord> {
    if (input.submissionId) {
      const existing = await this.findBetBySubmissionId(input.submissionId);
      if (existing) {
        if (existing.contractFingerprint !== input.contractFingerprint) {
          throw new BetSubmissionConflict(
            "This submission identifier was already used with different inputs.",
          );
        }
        return existing;
      }
    }
    const id = randomUUID();
    try {
      await this.sql`
        INSERT INTO bets (
          id, offer_id, analysis_id, submission_id, contract, contract_fingerprint,
          american_odds, decimal_odds, placed_at, stake_units, sportsbook
        ) VALUES (
          ${id}, ${input.offerId}, ${input.analysisId ?? null}, ${input.submissionId ?? null},
          ${input.contract ? this.sql.json(input.contract as never) : null},
          ${input.contractFingerprint ?? null}, ${input.americanOdds},
          ${americanToDecimal(input.americanOdds)}, ${input.placedAt}, ${input.stakeUnits},
          ${input.sportsbook ?? null}
        )
      `;
    } catch (error) {
      if (input.submissionId && isUniqueViolation(error)) {
        const existing = await this.findBetBySubmissionId(input.submissionId);
        if (existing && existing.contractFingerprint === input.contractFingerprint) return existing;
        throw new BetSubmissionConflict(
          "This submission identifier was already used with different inputs.",
        );
      }
      throw error;
    }
    const bet = await this.readBet(id);
    if (!bet) throw new Error("Bet was not persisted");
    return bet;
  }

  async insertSettlementNotice(input: {
    id: string;
    eventId: string;
    analysisId: string;
    betId: string | null;
    kind: "final" | "postponed" | "void" | "unresolved";
    homeScore: number | null;
    awayScore: number | null;
    source: string;
    reason: string | null;
    correctsId: string | null;
    recordedAt: string;
    payloadKey: string;
  }): Promise<void> {
    await this.sql`
      INSERT INTO settlement_notices (
        id, event_id, analysis_id, bet_id, kind, home_score, away_score,
        source, reason, corrects_id, recorded_at, payload_key
      ) VALUES (
        ${input.id}, ${input.eventId}, ${input.analysisId}, ${input.betId}, ${input.kind},
        ${input.homeScore}, ${input.awayScore}, ${input.source}, ${input.reason},
        ${input.correctsId}, ${input.recordedAt}, ${input.payloadKey}
      )
    `;
  }

  async findSettlementNoticeByEvent(eventId: string): Promise<{
    id: string;
    payloadKey: string;
  } | null> {
    const rows = await this.sql<{ id: string; payload_key: string }[]>`
      SELECT id, payload_key FROM settlement_notices WHERE event_id = ${eventId}
    `;
    const row = rows[0];
    return row ? { id: row.id, payloadKey: row.payload_key } : null;
  }

  async readSettlementNotice(
    id: string,
  ): Promise<{ id: string; analysisId: string | null } | null> {
    const rows = await this.sql<{ id: string; analysis_id: string | null }[]>`
      SELECT id, analysis_id FROM settlement_notices WHERE id = ${id}
    `;
    const row = rows[0];
    return row ? { id: row.id, analysisId: row.analysis_id } : null;
  }

  async listSettlementNotices(analysisId: string): Promise<
    Array<{
      id: string;
      eventId: string;
      analysisId: string;
      betId: string | null;
      kind: "final" | "postponed" | "void" | "unresolved";
      homeScore: number | null;
      awayScore: number | null;
      source: string;
      reason: string | null;
      correctsId: string | null;
      recordedAt: string;
    }>
  > {
    const rows = await this.sql<
      Array<{
        id: string;
        event_id: string;
        analysis_id: string;
        bet_id: string | null;
        kind: "final" | "postponed" | "void" | "unresolved";
        home_score: number | null;
        away_score: number | null;
        source: string;
        reason: string | null;
        corrects_id: string | null;
        recorded_at: Date | string;
      }>
    >`SELECT * FROM settlement_notices WHERE analysis_id = ${analysisId} ORDER BY recorded_at ASC`;
    return rows.map((row) => ({
      id: row.id,
      eventId: row.event_id,
      analysisId: row.analysis_id,
      betId: row.bet_id,
      kind: row.kind,
      homeScore: row.home_score,
      awayScore: row.away_score,
      source: row.source,
      reason: row.reason,
      correctsId: row.corrects_id,
      recordedAt: iso(row.recorded_at) ?? "",
    }));
  }

  async findBetBySubmissionId(submissionId: string): Promise<BetRecord | null> {
    const rows = await this.sql<BetRow[]>`
      SELECT * FROM bets WHERE submission_id = ${submissionId}
    `;
    return rows[0] ? mapBet(rows[0]) : null;
  }

  async recordSettlement(input: {
    betId?: string | null;
    offerId?: string | null;
    result: SettlementResult;
    rules: string;
    source: string;
    reason?: string | null;
    settledAt: string;
  }): Promise<SettlementRecord> {
    const id = randomUUID();
    await this.sql`
      INSERT INTO settlements (id, bet_id, offer_id, result, rules, source, reason, settled_at)
      VALUES (
        ${id}, ${input.betId ?? null}, ${input.offerId ?? null}, ${input.result},
        ${input.rules}, ${input.source}, ${input.reason ?? null}, ${input.settledAt}
      )
    `;
    const row = await this.readSettlement(id);
    if (!row) throw new Error("Settlement was not persisted");
    return row;
  }

  async correctSettlement(input: {
    settlementId: string;
    result: SettlementResult;
    reason: string;
    source: string;
    settledAt: string;
  }): Promise<SettlementRecord> {
    const previous = await this.readSettlement(input.settlementId);
    if (!previous) throw new Error(`Settlement not found: ${input.settlementId}`);
    const id = randomUUID();
    await this.sql`
      INSERT INTO settlements (
        id, bet_id, offer_id, result, rules, source, reason, settled_at, corrects_id
      ) VALUES (
        ${id}, ${previous.betId}, ${previous.offerId}, ${input.result}, ${previous.rules},
        ${input.source}, ${input.reason}, ${input.settledAt}, ${previous.id}
      )
    `;
    const row = await this.readSettlement(id);
    if (!row) throw new Error("Settlement correction was not persisted");
    return row;
  }

  async settlementHistory(rootOrAnyId: string): Promise<SettlementRecord[]> {
    const rows = await this.sql<SettlementRow[]>`
      WITH RECURSIVE chain AS (
        SELECT * FROM settlements WHERE id = ${rootOrAnyId}
        UNION
        SELECT s.* FROM settlements s
        JOIN chain c ON s.id = c.corrects_id OR s.corrects_id = c.id
      )
      SELECT DISTINCT * FROM chain ORDER BY created_at ASC
    `;
    return rows.map(mapSettlement);
  }

  async exportJournal(analysisIds?: string[]): Promise<JournalExport> {
    const analyses = analysisIds?.length
      ? await this.sql<AnalysisRow[]>`SELECT * FROM analyses WHERE id = ANY(${analysisIds}::uuid[])`
      : await this.sql<AnalysisRow[]>`SELECT * FROM analyses ORDER BY created_at ASC`;
    const ids = analyses.map((row) => row.id);
    const mapped = (await Promise.all(ids.map((id) => this.readAnalysis(id)))).filter(
      (row): row is AnalysisRecord => row !== null,
    );
    const offerIds = [...new Set(mapped.map((row) => row.offerId))];
    const offers = offerIds.length
      ? await this.sql<OfferRow[]>`SELECT * FROM offers WHERE id = ANY(${offerIds}::uuid[])`
      : [];
    const gameIds = [...new Set(offers.map((row) => row.game_id))];
    const games = gameIds.length
      ? await this.sql<GameRow[]>`SELECT * FROM games WHERE id = ANY(${gameIds}::uuid[])`
      : [];
    const evidence = ids.length
      ? await this.sql<EvidenceRow[]>`
          SELECT DISTINCT e.* FROM evidence e
          JOIN analysis_evidence ae ON ae.evidence_id = e.id
          WHERE ae.analysis_id = ANY(${ids}::uuid[])
        `
      : [];
    const reports = ids.length
      ? await this.sql<ReportRow[]>`SELECT * FROM reports WHERE analysis_id = ANY(${ids}::uuid[])`
      : [];
    const research = ids.length
      ? await this.sql<
          ResearchRow[]
        >`SELECT * FROM user_research WHERE analysis_id = ANY(${ids}::uuid[])`
      : [];
    const bets = offerIds.length
      ? await this.sql<BetRow[]>`SELECT * FROM bets WHERE offer_id = ANY(${offerIds}::uuid[])`
      : [];
    const betIds = bets.map((row) => row.id);
    const settlements =
      offerIds.length || betIds.length
        ? await this.sql<SettlementRow[]>`
            SELECT * FROM settlements
            WHERE offer_id = ANY(${offerIds.length ? offerIds : [randomUUID()]}::uuid[])
               OR bet_id = ANY(${betIds.length ? betIds : [randomUUID()]}::uuid[])
            ORDER BY created_at ASC
          `
        : [];
    const closings =
      ids.length || betIds.length
        ? await this.sql<ClosingRow[]>`
          SELECT * FROM closing_observations
          WHERE analysis_id = ANY(${ids.length ? ids : [randomUUID()]}::uuid[])
             OR bet_id = ANY(${betIds.length ? betIds : [randomUUID()]}::uuid[])
          ORDER BY created_at ASC
        `
        : [];
    const notices = ids.length
      ? await this.sql<SettlementNoticeRow[]>`
          SELECT * FROM settlement_notices
          WHERE analysis_id = ANY(${ids}::uuid[])
          ORDER BY recorded_at ASC
        `
      : [];
    return {
      version: 1,
      games: games.map(mapGame),
      offers: offers.map(mapOffer),
      evidence: evidence.map(mapEvidence),
      analyses: mapped.map(stripAnalysisSecrets),
      reports: reports.map(mapReport),
      userResearch: research.map(mapResearch),
      bets: bets.map(mapBet),
      settlements: settlements.map(mapSettlement),
      closings: closings.map(mapClosing),
      settlementNotices: notices.map(mapSettlementNotice),
    };
  }

  /**
   * Restore a version 1 backup with its original ids, times, and relationships.
   * The whole backup is checked before any write. An identical record is left
   * alone, so restoring the same snapshot twice changes nothing. A conflicting
   * identifier aborts the import and leaves the destination unchanged.
   * Games already stored under the same source id keep that row when the
   * schedule fields match. Pending and ambiguous attempts are stored as records
   * only. Restore does not call a source or a provider.
   */
  async restoreJournal(snapshot: JournalExport): Promise<JournalExport> {
    assertRestorable(snapshot);

    await this.sql.begin(async (tx) => {
      const gameIds = await restoreGames(tx, snapshot.games);
      await restoreOffers(tx, snapshot.offers, gameIds);
      await restoreEvidence(tx, snapshot.evidence);
      await restoreAnalyses(tx, snapshot.analyses);
      await restoreReports(tx, snapshot.reports);
      await restoreResearch(tx, snapshot.userResearch);
      await restoreBets(tx, snapshot.bets);
      await restoreSettlements(tx, snapshot.settlements);
      await restoreClosings(tx, snapshot.closings);
      await restoreSettlementNotices(tx, snapshot.settlementNotices ?? []);
    });

    return this.exportJournal(snapshot.analyses.map((row) => row.id));
  }

  private async readOffer(id: string): Promise<OfferRecord | null> {
    const rows = await this.sql<OfferRow[]>`SELECT * FROM offers WHERE id = ${id}`;
    return rows[0] ? mapOffer(rows[0]) : null;
  }

  private async readAnalysis(id: string): Promise<AnalysisRecord | null> {
    const rows = await this.sql<AnalysisRow[]>`SELECT * FROM analyses WHERE id = ${id}`;
    if (!rows[0]) return null;
    const links = await this.sql<{ evidence_id: string }[]>`
      SELECT evidence_id FROM analysis_evidence WHERE analysis_id = ${id}
      ORDER BY position ASC NULLS LAST
    `;
    return mapAnalysis(
      rows[0],
      links.map((row) => row.evidence_id),
    );
  }

  private async readEvidenceForAnalysis(analysisId: string): Promise<EvidenceRecord[]> {
    const rows = await this.sql<EvidenceRow[]>`
      SELECT e.* FROM evidence e
      JOIN analysis_evidence ae ON ae.evidence_id = e.id
      WHERE ae.analysis_id = ${analysisId}
      ORDER BY ae.position ASC NULLS LAST, e.created_at ASC
    `;
    return rows.map(mapEvidence);
  }

  private async readReport(analysisId: string): Promise<ReportRecord | null> {
    const rows = await this.sql<
      ReportRow[]
    >`SELECT * FROM reports WHERE analysis_id = ${analysisId}`;
    return rows[0] ? mapReport(rows[0]) : null;
  }

  private async readUserResearch(analysisId: string): Promise<UserResearchRecord | null> {
    const rows = await this.sql<ResearchRow[]>`
      SELECT * FROM user_research WHERE analysis_id = ${analysisId}
    `;
    return rows[0] ? mapResearch(rows[0]) : null;
  }

  private async readBet(id: string): Promise<BetRecord | null> {
    const rows = await this.sql<BetRow[]>`SELECT * FROM bets WHERE id = ${id}`;
    return rows[0] ? mapBet(rows[0]) : null;
  }

  private async readSettlement(id: string): Promise<SettlementRecord | null> {
    const rows = await this.sql<SettlementRow[]>`SELECT * FROM settlements WHERE id = ${id}`;
    return rows[0] ? mapSettlement(rows[0]) : null;
  }
}

const CREDENTIAL_KEYS = new Set([
  "authorization",
  "proxy-authorization",
  "x-api-key",
  "api-key",
  "apikey",
  "api_key",
  "cookie",
  "set-cookie",
]);

function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !CREDENTIAL_KEYS.has(key.toLowerCase()))
        .map(([key, item]) => [key, stripSecrets(item)]),
    );
  }
  return value;
}

function stripAnalysisSecrets(analysis: AnalysisRecord): AnalysisRecord {
  return {
    ...analysis,
    snapshot: stripSecrets(analysis.snapshot) as AnalysisSnapshot,
    policy: stripSecrets(analysis.policy),
    stages: stripSecrets(analysis.stages),
    usage: stripSecrets(analysis.usage),
  };
}

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
  const games = idsOf(snapshot.games, "game");
  const offers = idsOf(snapshot.offers, "offer");
  const evidence = idsOf(snapshot.evidence, "evidence");
  const analyses = idsOf(snapshot.analyses, "analysis");
  const reports = idsOf(snapshot.reports, "report");
  const research = idsOf(snapshot.userResearch, "user research");
  const bets = idsOf(snapshot.bets, "bet");
  const settlements = idsOf(snapshot.settlements, "settlement");
  idsOf(snapshot.closings, "closing observation");
  const notices = idsOf(snapshot.settlementNotices ?? [], "settlement notice");

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
  for (const bet of snapshot.bets) {
    requireReference(offers, bet.offerId, `Bet ${bet.id} is missing its offer.`);
    if (bet.analysisId) {
      requireReference(analyses, bet.analysisId, `Bet ${bet.id} is missing its analysis.`);
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
  for (const notice of snapshot.settlementNotices ?? []) {
    requireReference(
      analyses,
      notice.analysisId,
      `Settlement notice ${notice.id} is missing its analysis.`,
    );
    if (notice.betId) {
      requireReference(bets, notice.betId, `Settlement notice ${notice.id} is missing its bet.`);
    }
    if (notice.correctsId) {
      requireReference(
        notices,
        notice.correctsId,
        `Settlement notice ${notice.id} is missing the notice it corrects.`,
      );
    }
    if (!notice.eventId || !notice.recordedAt || !notice.payloadKey) {
      throw new Error(`Settlement notice ${notice.id} is missing its event history.`);
    }
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
    if (!closing.analysisId && !closing.betId) {
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

type RestoreTx = TransactionSql;

function sameRecord(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function conflict(label: string, id: string): never {
  throw new Error(`Conflicting ${label} identifier ${id} does not match the saved record.`);
}

async function restoreGames(tx: RestoreTx, games: GameRecord[]): Promise<Map<string, string>> {
  const gameIds = new Map<string, string>();
  for (const game of games) {
    const existing = await tx<GameRow[]>`
      SELECT * FROM games WHERE id = ${game.id} OR source_game_id = ${game.sourceGameId}
    `;
    if (existing[0]) {
      const stored = mapGame(existing[0]);
      const sameSchedule = sameRecord({ ...stored, id: game.id }, game);
      if (!sameSchedule) conflict("game", game.id);
      gameIds.set(game.id, stored.id);
      continue;
    }
    await tx`
      INSERT INTO games (
        id, source_game_id, season, week, away_team, home_team, kickoff_at, venue, status
      ) VALUES (
        ${game.id}, ${game.sourceGameId}, ${game.season}, ${game.week},
        ${game.awayTeam}, ${game.homeTeam}, ${game.kickoffAt}, ${game.venue}, ${game.status}
      )
    `;
    gameIds.set(game.id, game.id);
  }
  return gameIds;
}

async function restoreOffers(
  tx: RestoreTx,
  offers: OfferRecord[],
  gameIds: Map<string, string>,
): Promise<void> {
  for (const offer of offers) {
    const gameId = gameIds.get(offer.gameId) ?? offer.gameId;
    const incoming = { ...offer, gameId };
    const existing = await tx<OfferRow[]>`SELECT * FROM offers WHERE id = ${offer.id}`;
    if (existing[0]) {
      if (!sameRecord(mapOffer(existing[0]), incoming)) conflict("offer", offer.id);
      continue;
    }
    await tx`
      INSERT INTO offers (
        id, game_id, sportsbook, market, selection, point_line, american_odds, decimal_odds,
        observed_at, entered_at, kickoff_at, rules, opposing, completed_at
      ) VALUES (
        ${offer.id}, ${gameId}, ${offer.sportsbook},
        ${offer.market}, ${offer.selection}, ${offer.pointLine}, ${offer.americanOdds},
        ${offer.decimalOdds}, ${offer.observedAt}, ${offer.enteredAt}, ${offer.kickoffAt},
        ${tx.json(offer.rules as never)},
        ${offer.opposing ? tx.json(offer.opposing as never) : null},
        ${offer.completedAt}
      )
    `;
  }
}

async function restoreEvidence(tx: RestoreTx, evidence: EvidenceRecord[]): Promise<void> {
  for (const item of evidence) {
    const existing = await tx<EvidenceRow[]>`SELECT * FROM evidence WHERE id = ${item.id}`;
    if (existing[0]) {
      if (!sameRecord(mapEvidence(existing[0]), item)) conflict("evidence", item.id);
      continue;
    }
    await tx`
      INSERT INTO evidence (
        id, source_id, source_url, retrieved_at, published_at, effective_at,
        checksum, body, origin, completeness, completed_at, packet_item_id
      ) VALUES (
        ${item.id}, ${item.sourceId}, ${item.sourceUrl}, ${item.retrievedAt},
        ${item.publishedAt}, ${item.effectiveAt}, ${item.checksum}, ${tx.json(item.body as never)},
        ${item.origin}, ${item.completeness}, ${item.completedAt}, ${item.packetItemId ?? null}
      )
    `;
  }
}

async function restoreAnalyses(tx: RestoreTx, analyses: AnalysisRecord[]): Promise<void> {
  const evidenceByAnalysis = new Map(analyses.map((row) => [row.id, row.evidenceIds]));
  for (const analysis of parentsFirst(analyses, (row) => row.parentId)) {
    const existing = await tx<AnalysisRow[]>`SELECT * FROM analyses WHERE id = ${analysis.id}`;
    if (existing[0]) {
      const links = await tx<{ evidence_id: string }[]>`
        SELECT evidence_id FROM analysis_evidence WHERE analysis_id = ${analysis.id}
        ORDER BY position ASC NULLS LAST
      `;
      const stored = mapAnalysis(
        existing[0],
        links.map((row) => row.evidence_id),
      );
      if (!sameRecord(stripAnalysisSecrets(stored), stripAnalysisSecrets(analysis))) {
        conflict("analysis", analysis.id);
      }
      continue;
    }
    await tx`
      INSERT INTO analyses (
        id, offer_id, parent_id, cutoff_at, status, conclusion,
        method_version, policy_version, schema_version, prompt_version,
        evidence_packet_hash, provider, model, failure_reason, idempotency_key, completed_at,
        created_at, policy, stages, gaps, usage, probability_model, snapshot,
        assessment_role, assessment_role_reason, primary_analysis_id
      ) VALUES (
        ${analysis.id}, ${analysis.offerId}, ${analysis.parentId},
        ${analysis.cutoffAt}, ${analysis.status}, ${analysis.conclusion},
        ${analysis.methodVersion}, ${analysis.policyVersion}, ${analysis.schemaVersion},
        ${analysis.promptVersion}, ${analysis.evidencePacketHash}, ${analysis.provider},
        ${analysis.model}, ${analysis.failureReason}, ${analysis.idempotencyKey},
        ${analysis.completedAt}, ${analysis.createdAt},
        ${jsonOrNull(tx, analysis.policy)}, ${jsonOrNull(tx, analysis.stages)},
        ${jsonOrNull(tx, analysis.gaps)}, ${jsonOrNull(tx, analysis.usage)},
        ${jsonOrNull(tx, analysis.probabilityModel)}, ${tx.json(stripSecrets(analysis.snapshot) as never)},
        ${analysis.assessmentRole}, ${analysis.assessmentRoleReason}, ${analysis.primaryAnalysisId}
      )
    `;
    const evidenceIds = evidenceByAnalysis.get(analysis.id) ?? [];
    for (const [position, evidenceId] of evidenceIds.entries()) {
      const evidence = await tx<{ completeness: string }[]>`
        SELECT completeness FROM evidence WHERE id = ${evidenceId}
      `;
      await tx`
        INSERT INTO analysis_evidence (analysis_id, evidence_id, completeness, position)
        VALUES (
          ${analysis.id}, ${evidenceId},
          ${evidence[0]?.completeness ?? "complete"}, ${position}
        )
      `;
    }
  }
}

async function restoreReports(tx: RestoreTx, reports: ReportRecord[]): Promise<void> {
  for (const report of reports) {
    const existing = await tx<ReportRow[]>`SELECT * FROM reports WHERE id = ${report.id}`;
    if (existing[0]) {
      if (!sameRecord(mapReport(existing[0]), report)) conflict("report", report.id);
      continue;
    }
    await tx`
      INSERT INTO reports (id, analysis_id, claims, thesis, usage, rendered_bytes, completed_at, body)
      VALUES (
        ${report.id}, ${report.analysisId}, ${tx.json(report.claims as never)},
        ${report.thesis}, ${report.usage ? tx.json(report.usage as never) : null},
        ${Buffer.from(report.renderedText, "utf8")}, ${report.completedAt},
        ${jsonOrNull(tx, report.body)}
      )
    `;
  }
}

async function restoreResearch(tx: RestoreTx, rows: UserResearchRecord[]): Promise<void> {
  for (const research of rows) {
    const existing = await tx<ResearchRow[]>`SELECT * FROM user_research WHERE id = ${research.id}`;
    if (existing[0]) {
      if (!sameRecord(mapResearch(existing[0]), research)) conflict("user research", research.id);
      continue;
    }
    await tx`
      INSERT INTO user_research (id, analysis_id, lean, rationale)
      VALUES (${research.id}, ${research.analysisId}, ${research.lean}, ${research.rationale})
    `;
  }
}

async function restoreBets(tx: RestoreTx, bets: BetRecord[]): Promise<void> {
  for (const bet of bets) {
    const existing = await tx<BetRow[]>`SELECT * FROM bets WHERE id = ${bet.id}`;
    if (existing[0]) {
      if (!sameRecord(mapBet(existing[0]), bet)) conflict("bet", bet.id);
      continue;
    }
    await tx`
      INSERT INTO bets (
        id, offer_id, analysis_id, submission_id, contract, contract_fingerprint,
        american_odds, decimal_odds, placed_at, stake_units, sportsbook
      ) VALUES (
        ${bet.id}, ${bet.offerId}, ${bet.analysisId}, ${bet.submissionId ?? null},
        ${bet.contract ? tx.json(bet.contract as never) : null},
        ${bet.contractFingerprint ?? null}, ${bet.americanOdds}, ${bet.decimalOdds},
        ${bet.placedAt}, ${bet.stakeUnits}, ${bet.sportsbook ?? null}
      )
    `;
  }
}

async function restoreSettlements(tx: RestoreTx, settlements: SettlementRecord[]): Promise<void> {
  for (const settlement of parentsFirst(settlements, (row) => row.correctsId)) {
    const existing = await tx<
      SettlementRow[]
    >`SELECT * FROM settlements WHERE id = ${settlement.id}`;
    if (existing[0]) {
      if (!sameRecord(mapSettlement(existing[0]), settlement))
        conflict("settlement", settlement.id);
      continue;
    }
    await tx`
      INSERT INTO settlements (
        id, bet_id, offer_id, result, rules, source, reason, settled_at, corrects_id
      ) VALUES (
        ${settlement.id}, ${settlement.betId}, ${settlement.offerId}, ${settlement.result},
        ${settlement.rules}, ${settlement.source}, ${settlement.reason},
        ${settlement.settledAt}, ${settlement.correctsId}
      )
    `;
  }
}

async function restoreSettlementNotices(
  tx: RestoreTx,
  notices: SettlementNoticeRecord[],
): Promise<void> {
  for (const notice of parentsFirst(notices, (row) => row.correctsId)) {
    const existing = await tx<SettlementNoticeRow[]>`
      SELECT * FROM settlement_notices WHERE id = ${notice.id} OR event_id = ${notice.eventId}
    `;
    if (existing[0]) {
      const stored = mapSettlementNotice(existing[0]);
      if (stored.id !== notice.id || !sameRecord(stored, notice))
        conflict("settlement notice", notice.id);
      continue;
    }
    await tx`
      INSERT INTO settlement_notices (
        id, event_id, analysis_id, bet_id, kind, home_score, away_score,
        source, reason, corrects_id, recorded_at, payload_key
      ) VALUES (
        ${notice.id}, ${notice.eventId}, ${notice.analysisId}, ${notice.betId}, ${notice.kind},
        ${notice.homeScore}, ${notice.awayScore}, ${notice.source}, ${notice.reason},
        ${notice.correctsId}, ${notice.recordedAt}, ${notice.payloadKey}
      )
    `;
  }
}

async function restoreClosings(tx: RestoreTx, closings: ClosingRecord[]): Promise<void> {
  for (const closing of closings) {
    const existing = await tx<ClosingRow[]>`
      SELECT * FROM closing_observations WHERE id = ${closing.id}
    `;
    if (existing[0]) {
      if (!sameRecord(mapClosing(existing[0]), closing))
        conflict("closing observation", closing.id);
      continue;
    }
    await tx`
      INSERT INTO closing_observations (
        id, analysis_id, bet_id, provenance, sportsbook, market, selection, point_line,
        rules, american_odds, decimal_odds, observed_at, source
      ) VALUES (
        ${closing.id}, ${closing.analysisId}, ${closing.betId}, ${closing.provenance},
        ${closing.sportsbook}, ${closing.market}, ${closing.selection}, ${closing.pointLine},
        ${tx.json(closing.rules as never)}, ${closing.americanOdds}, ${closing.decimalOdds},
        ${closing.observedAt}, ${closing.source}
      )
    `;
  }
}

function jsonOrNull(tx: Pick<Sql, "json">, value: unknown) {
  return value === undefined || value === null ? null : tx.json(value as never);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

const PRIMARY_REASON = "Earliest completed analysis before kickoff";
const REFRESH_REASON = "Later completed analysis. The primary assessment is unchanged.";
const NOT_COMPLETED_REASON = "This analysis did not complete before kickoff.";
const AFTER_KICKOFF_REASON =
  "Decision cutoff is not before kickoff, so this analysis is not an eligible pregame assessment.";

type RoleSql = TransactionSql;

/** Locks the game's classified rows. Never reads scores and never writes. */
async function chooseAssessmentRole(
  tx: RoleSql,
  input: {
    analysisId: string;
    status: string;
    cutoffAt: string;
    gameId: string;
    kickoffAt: string;
  },
): Promise<{
  role: "primary" | "refresh" | "ineligible";
  reason: string;
  primaryId: string | null;
}> {
  const locked = await tx.unsafe(
    `SELECT id, completed_at, assessment_role
     FROM analyses
     WHERE snapshot->'game'->>'sourceGameId' = $1
       AND assessment_role IS NOT NULL
     ORDER BY completed_at ASC NULLS LAST, id ASC
     FOR UPDATE`,
    [input.gameId],
  );
  const pregame =
    input.status === "completed" && Date.parse(input.cutoffAt) < Date.parse(input.kickoffAt);
  const primary = locked.find((row) => row.assessment_role === "primary");
  if (!pregame) {
    return {
      role: "ineligible",
      reason: input.status === "completed" ? AFTER_KICKOFF_REASON : NOT_COMPLETED_REASON,
      primaryId: null,
    };
  }
  if (!primary || primary.id === input.analysisId) {
    return { role: "primary", reason: PRIMARY_REASON, primaryId: null };
  }
  return { role: "refresh", reason: REFRESH_REASON, primaryId: primary.id };
}

function listedAssessmentRole(row: {
  assessment_role: "primary" | "refresh" | "ineligible" | null;
  assessment_role_reason: string | null;
  primary_analysis_id: string | null;
  completed_at: Date | null;
}): import("../analysis/store.ts").AssessmentRole {
  if (!row.assessment_role || !row.completed_at) {
    return {
      role: "unclassified",
      reason:
        "Completion time was not recorded, so this analysis was not classified before outcomes.",
    };
  }
  if (row.assessment_role === "refresh" && row.primary_analysis_id) {
    return {
      role: "refresh",
      primaryId: row.primary_analysis_id,
      reason: row.assessment_role_reason ?? "",
    };
  }
  if (row.assessment_role === "ineligible") {
    return { role: "ineligible", reason: row.assessment_role_reason ?? "" };
  }
  return { role: "primary", reason: row.assessment_role_reason ?? "" };
}

export class BetSubmissionConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BetSubmissionConflict";
  }
}

type GameRow = {
  id: string;
  source_game_id: string;
  season: number;
  week: number | null;
  away_team: string;
  home_team: string;
  kickoff_at: Date;
  venue: string | null;
  status: string;
};

type OfferRow = {
  id: string;
  game_id: string;
  sportsbook: string;
  market: Offer["market"];
  selection: Offer["selection"];
  point_line: string | null;
  american_odds: number;
  decimal_odds: string;
  observed_at: Date;
  entered_at: Date;
  kickoff_at: Date;
  rules: Offer["rules"];
  opposing: Offer["opposing"];
  completed_at: Date | null;
};

type EvidenceRow = {
  id: string;
  source_id: string;
  source_url: string | null;
  retrieved_at: Date;
  published_at: Date | null;
  effective_at: Date | null;
  checksum: string;
  body: unknown;
  origin: "manual" | "automatic";
  completeness: string;
  completed_at: Date | null;
  packet_item_id: string | null;
};

type AnalysisRow = {
  id: string;
  offer_id: string;
  parent_id: string | null;
  snapshot: AnalysisSnapshot;
  cutoff_at: Date;
  status: AnalysisRecord["status"];
  conclusion: string | null;
  method_version: string | null;
  policy_version: string | null;
  schema_version: string | null;
  prompt_version: string | null;
  evidence_packet_hash: string | null;
  provider: string | null;
  model: string | null;
  failure_reason: string | null;
  idempotency_key: string | null;
  completed_at: Date | null;
  created_at: Date;
  policy: unknown;
  stages: unknown;
  gaps: unknown;
  usage: unknown;
  probability_model: unknown;
  assessment_role: "primary" | "refresh" | "ineligible" | null;
  assessment_role_reason: string | null;
  primary_analysis_id: string | null;
};

type ReportRow = {
  id: string;
  analysis_id: string;
  claims: unknown;
  thesis: string;
  usage: unknown;
  rendered_bytes: Buffer | Uint8Array;
  completed_at: Date;
  body: unknown;
};

type ResearchRow = {
  id: string;
  analysis_id: string;
  lean: string | null;
  rationale: string | null;
};

type BetRow = {
  id: string;
  offer_id: string;
  analysis_id: string | null;
  submission_id: string | null;
  contract: BetContract | null;
  contract_fingerprint: string | null;
  american_odds: number;
  decimal_odds: string;
  placed_at: Date;
  stake_units: string;
  sportsbook: string | null;
};

type ClosingRow = {
  id: string;
  analysis_id: string | null;
  bet_id: string | null;
  provenance: ClosingProvenance;
  sportsbook: string;
  market: BetContract["market"];
  selection: BetContract["selection"];
  point_line: string | null;
  rules: BetContract["rules"];
  american_odds: number;
  decimal_odds: string;
  observed_at: Date | null;
  source: string;
};

type SettlementRow = {
  id: string;
  bet_id: string | null;
  offer_id: string | null;
  result: SettlementResult;
  rules: string;
  source: string;
  reason: string | null;
  settled_at: Date;
  corrects_id: string | null;
};

function mapGame(row: GameRow): GameRecord {
  return {
    id: row.id,
    sourceGameId: row.source_game_id,
    season: row.season,
    week: row.week,
    awayTeam: row.away_team,
    homeTeam: row.home_team,
    kickoffAt: iso(row.kickoff_at)!,
    venue: row.venue,
    status: row.status,
  };
}

function mapOffer(row: OfferRow): OfferRecord {
  return {
    id: row.id,
    gameId: row.game_id,
    sportsbook: row.sportsbook,
    market: row.market,
    selection: row.selection,
    pointLine: num(row.point_line),
    americanOdds: row.american_odds,
    decimalOdds: num(row.decimal_odds)!,
    observedAt: iso(row.observed_at)!,
    enteredAt: iso(row.entered_at)!,
    kickoffAt: iso(row.kickoff_at)!,
    rules: row.rules,
    opposing: row.opposing,
    completedAt: iso(row.completed_at),
  };
}

function mapEvidence(row: EvidenceRow): EvidenceRecord {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    retrievedAt: iso(row.retrieved_at)!,
    publishedAt: iso(row.published_at),
    effectiveAt: iso(row.effective_at),
    checksum: row.checksum,
    body: row.body,
    origin: row.origin,
    completeness: row.completeness,
    completedAt: iso(row.completed_at),
    packetItemId: row.packet_item_id,
  };
}

function mapAnalysis(row: AnalysisRow, evidenceIds: string[]): AnalysisRecord {
  return {
    id: row.id,
    offerId: row.offer_id,
    parentId: row.parent_id,
    snapshot: row.snapshot,
    cutoffAt: iso(row.cutoff_at)!,
    status: row.status,
    conclusion: row.conclusion,
    methodVersion: row.method_version,
    policyVersion: row.policy_version,
    schemaVersion: row.schema_version,
    promptVersion: row.prompt_version,
    evidencePacketHash: row.evidence_packet_hash,
    provider: row.provider,
    model: row.model,
    failureReason: row.failure_reason,
    idempotencyKey: row.idempotency_key,
    completedAt: iso(row.completed_at),
    createdAt: iso(row.created_at)!,
    policy: row.policy,
    stages: row.stages,
    gaps: row.gaps,
    usage: row.usage,
    probabilityModel: row.probability_model,
    evidenceIds,
    assessmentRole: row.assessment_role,
    assessmentRoleReason: row.assessment_role_reason,
    primaryAnalysisId: row.primary_analysis_id,
  };
}

function mapReport(row: ReportRow): ReportRecord {
  const bytes = Buffer.isBuffer(row.rendered_bytes)
    ? row.rendered_bytes
    : Buffer.from(row.rendered_bytes);
  return {
    id: row.id,
    analysisId: row.analysis_id,
    claims: row.claims,
    thesis: row.thesis,
    usage: row.usage,
    renderedText: bytes.toString("utf8"),
    completedAt: iso(row.completed_at)!,
    body: row.body,
  };
}

function mapResearch(row: ResearchRow): UserResearchRecord {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    lean: row.lean,
    rationale: row.rationale,
  };
}

function mapBet(row: BetRow): BetRecord {
  return {
    id: row.id,
    offerId: row.offer_id,
    analysisId: row.analysis_id,
    submissionId: row.submission_id,
    contract: row.contract,
    contractFingerprint: row.contract_fingerprint,
    americanOdds: row.american_odds,
    decimalOdds: num(row.decimal_odds)!,
    placedAt: iso(row.placed_at)!,
    stakeUnits: num(row.stake_units)!,
    sportsbook: row.sportsbook,
  };
}

function mapClosing(row: ClosingRow): ClosingRecord {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    betId: row.bet_id,
    provenance: row.provenance,
    sportsbook: row.sportsbook,
    market: row.market,
    selection: row.selection,
    pointLine: num(row.point_line),
    rules: row.rules,
    americanOdds: row.american_odds,
    decimalOdds: num(row.decimal_odds)!,
    observedAt: iso(row.observed_at),
    source: row.source,
  };
}

function mapSettlement(row: SettlementRow): SettlementRecord {
  return {
    id: row.id,
    betId: row.bet_id,
    offerId: row.offer_id,
    result: row.result,
    rules: row.rules,
    source: row.source,
    reason: row.reason,
    settledAt: iso(row.settled_at)!,
    correctsId: row.corrects_id,
  };
}

type SettlementNoticeRow = {
  id: string;
  event_id: string;
  analysis_id: string;
  bet_id: string | null;
  kind: SettlementNoticeRecord["kind"];
  home_score: number | null;
  away_score: number | null;
  source: string;
  reason: string | null;
  corrects_id: string | null;
  recorded_at: Date | string;
  payload_key: string;
};

function mapSettlementNotice(row: SettlementNoticeRow): SettlementNoticeRecord {
  return {
    id: row.id,
    eventId: row.event_id,
    analysisId: row.analysis_id,
    betId: row.bet_id,
    kind: row.kind,
    homeScore: row.home_score,
    awayScore: row.away_score,
    source: row.source,
    reason: row.reason,
    correctsId: row.corrects_id,
    recordedAt: iso(row.recorded_at)!,
    payloadKey: row.payload_key,
  };
}
