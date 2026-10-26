import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
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

        await tx`
          INSERT INTO analyses (
            id, offer_id, parent_id, cutoff_at, status, conclusion,
            method_version, policy_version, schema_version, prompt_version,
            evidence_packet_hash, provider, model, failure_reason, idempotency_key, completed_at,
            policy, stages, gaps, usage, probability_model, snapshot
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
            ${jsonOrNull(tx, input.analysis.probabilityModel)}, ${tx.json(snapshot as never)}
          )
        `;
        if (
          input.analysis.status === "completed" ||
          input.analysis.status === "failed" ||
          input.analysis.status === "interrupted"
        ) {
          await assignAssessmentRole(tx, {
            analysisId,
            status: input.analysis.status,
            cutoffAt: input.analysis.cutoffAt,
            gameId: input.game.sourceGameId,
            kickoffAt: input.game.kickoffAt,
          });
        }

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
          snapshot = ${tx.json(snapshot as never)}
        WHERE id = ${analysisId} AND completed_at IS NULL
        RETURNING id
      `;
      if (!updated[0]) throw new Error(`Attempt is no longer writable: ${analysisId}`);
      if (completedAt) {
        await tx`UPDATE offers SET completed_at = ${completedAt} WHERE id = ${existing.offerId} AND completed_at IS NULL`;
      }
      await assignAssessmentRole(tx, {
        analysisId,
        status: input.analysis.status,
        cutoffAt: existing.cutoffAt,
        gameId: existing.snapshot.game.sourceGameId,
        kickoffAt: existing.snapshot.game.kickoffAt,
      });

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
    const rows = await this.sql<
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
    >`
      SELECT a.id, a.parent_id, a.created_at, a.conclusion,
             a.snapshot->'game'->>'sourceGameId' AS source_game_id,
             a.snapshot->'game'->>'homeTeam' AS home_team,
             a.snapshot->'game'->>'awayTeam' AS away_team,
             (a.snapshot->'game'->>'kickoffAt')::timestamptz AS kickoff_at,
             o.sportsbook, o.market, o.selection, o.point_line, o.american_odds,
             a.snapshot->>'provenance' AS snapshot_provenance,
             COALESCE((a.policy->>'reliesOnManualEvidence')::boolean, false) AS relies_on_manual_evidence,
             a.assessment_role, a.assessment_role_reason, a.primary_analysis_id, a.completed_at
      FROM analyses a
      JOIN offers o ON o.id = a.offer_id
      WHERE a.status = 'completed'
      ORDER BY a.created_at DESC
    `;
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
      const updated = await tx<{ id: string }[]>`
        UPDATE analyses SET status = 'interrupted', completed_at = COALESCE(completed_at, now())
        WHERE id = ${analysisId} AND status NOT IN ('completed', 'interrupted', 'failed')
        RETURNING id
      `;
      if (!updated[0]) return;
      const rows = await tx<AnalysisRow[]>`SELECT * FROM analyses WHERE id = ${analysisId}`;
      const row = rows[0];
      if (!row) return;
      await assignAssessmentRole(tx, {
        analysisId,
        status: "interrupted",
        cutoffAt: iso(row.cutoff_at)!,
        gameId: row.snapshot.game.sourceGameId,
        kickoffAt: row.snapshot.game.kickoffAt,
      });
    });
  }

  async listBets(): Promise<BetRecord[]> {
    const rows = await this.sql<BetRow[]>`SELECT * FROM bets ORDER BY created_at ASC`;
    return rows.map(mapBet);
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
        if (existing?.contractFingerprint === input.contractFingerprint) return existing;
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
    return {
      version: 1,
      games: games.map(mapGame),
      offers: offers.map(mapOffer),
      evidence: evidence.map(mapEvidence),
      analyses: mapped,
      reports: reports.map(mapReport),
      userResearch: research.map(mapResearch),
      bets: bets.map(mapBet),
      settlements: settlements.map(mapSettlement),
    };
  }

  /**
   * Restore an export with its original ids, times, and keys. Rows already present are left
   * alone, so restoring the same snapshot twice changes nothing. Games are matched by
   * source_game_id, since the schedule may already have created the same game under another id.
   */
  async restoreJournal(snapshot: JournalExport): Promise<JournalExport> {
    const gameIds = new Map<string, string>();

    await this.sql.begin(async (tx) => {
      for (const game of snapshot.games) {
        await tx`
          INSERT INTO games (
            id, source_game_id, season, week, away_team, home_team, kickoff_at, venue, status
          ) VALUES (
            ${game.id}, ${game.sourceGameId}, ${game.season}, ${game.week},
            ${game.awayTeam}, ${game.homeTeam}, ${game.kickoffAt}, ${game.venue}, ${game.status}
          )
          ON CONFLICT DO NOTHING
        `;
        const rows = await tx<{ id: string }[]>`
          SELECT id FROM games WHERE source_game_id = ${game.sourceGameId}
        `;
        gameIds.set(game.id, rows[0]?.id ?? game.id);
      }
      for (const offer of snapshot.offers) {
        await tx`
          INSERT INTO offers (
            id, game_id, sportsbook, market, selection, point_line, american_odds, decimal_odds,
            observed_at, entered_at, kickoff_at, rules, opposing, completed_at
          ) VALUES (
            ${offer.id}, ${gameIds.get(offer.gameId) ?? offer.gameId}, ${offer.sportsbook},
            ${offer.market}, ${offer.selection}, ${offer.pointLine}, ${offer.americanOdds},
            ${offer.decimalOdds}, ${offer.observedAt}, ${offer.enteredAt}, ${offer.kickoffAt},
            ${tx.json(offer.rules as never)},
            ${offer.opposing ? tx.json(offer.opposing as never) : null},
            ${offer.completedAt}
          )
          ON CONFLICT DO NOTHING
        `;
      }
      const evidenceById = new Map(snapshot.evidence.map((item) => [item.id, item]));
      for (const item of snapshot.evidence) {
        await tx`
          INSERT INTO evidence (
            id, source_id, source_url, retrieved_at, published_at, effective_at,
            checksum, body, origin, completeness, completed_at, packet_item_id
          ) VALUES (
            ${item.id}, ${item.sourceId}, ${item.sourceUrl}, ${item.retrievedAt},
            ${item.publishedAt}, ${item.effectiveAt}, ${item.checksum}, ${tx.json(item.body as never)},
            ${item.origin}, ${item.completeness}, ${item.completedAt}, ${item.packetItemId ?? null}
          )
          ON CONFLICT DO NOTHING
        `;
      }
      for (const analysis of parentsFirst(snapshot.analyses, (row) => row.parentId)) {
        await tx`
          INSERT INTO analyses (
            id, offer_id, parent_id, cutoff_at, status, conclusion,
            method_version, policy_version, schema_version, prompt_version,
            evidence_packet_hash, provider, model, failure_reason, idempotency_key, completed_at,
            created_at, policy, stages, gaps, usage, probability_model, snapshot
          ) VALUES (
            ${analysis.id}, ${analysis.offerId}, ${analysis.parentId},
            ${analysis.cutoffAt}, ${analysis.status}, ${analysis.conclusion},
            ${analysis.methodVersion}, ${analysis.policyVersion}, ${analysis.schemaVersion},
            ${analysis.promptVersion}, ${analysis.evidencePacketHash}, ${analysis.provider},
            ${analysis.model}, ${analysis.failureReason}, ${analysis.idempotencyKey},
            ${analysis.completedAt}, ${analysis.createdAt},
            ${jsonOrNull(tx, analysis.policy)}, ${jsonOrNull(tx, analysis.stages)},
            ${jsonOrNull(tx, analysis.gaps)}, ${jsonOrNull(tx, analysis.usage)},
            ${jsonOrNull(tx, analysis.probabilityModel)}, ${tx.json(analysis.snapshot as never)}
          )
          ON CONFLICT DO NOTHING
        `;
        for (const [position, evidenceId] of analysis.evidenceIds.entries()) {
          await tx`
            INSERT INTO analysis_evidence (analysis_id, evidence_id, completeness, position)
            VALUES (
              ${analysis.id}, ${evidenceId},
              ${evidenceById.get(evidenceId)?.completeness ?? "complete"}, ${position}
            )
            ON CONFLICT DO NOTHING
          `;
        }
      }
      for (const report of snapshot.reports) {
        await tx`
          INSERT INTO reports (id, analysis_id, claims, thesis, usage, rendered_bytes, completed_at, body)
          VALUES (
            ${report.id}, ${report.analysisId}, ${tx.json(report.claims as never)},
            ${report.thesis}, ${report.usage ? tx.json(report.usage as never) : null},
            ${Buffer.from(report.renderedText, "utf8")}, ${report.completedAt},
            ${jsonOrNull(tx, report.body)}
          )
          ON CONFLICT DO NOTHING
        `;
      }
      for (const research of snapshot.userResearch) {
        await tx`
          INSERT INTO user_research (id, analysis_id, lean, rationale)
          VALUES (${research.id}, ${research.analysisId}, ${research.lean}, ${research.rationale})
          ON CONFLICT DO NOTHING
        `;
      }
      for (const bet of snapshot.bets) {
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
          ON CONFLICT DO NOTHING
        `;
      }
      for (const settlement of parentsFirst(snapshot.settlements, (row) => row.correctsId)) {
        await tx`
          INSERT INTO settlements (
            id, bet_id, offer_id, result, rules, source, reason, settled_at, corrects_id
          ) VALUES (
            ${settlement.id}, ${settlement.betId}, ${settlement.offerId}, ${settlement.result},
            ${settlement.rules}, ${settlement.source}, ${settlement.reason},
            ${settlement.settledAt}, ${settlement.correctsId}
          )
          ON CONFLICT DO NOTHING
        `;
      }
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

type RoleSql = {
  unsafe: (
    query: string,
    values: unknown[],
  ) => Promise<
    Array<{
      id: string;
      completed_at: Date | string | null;
      assessment_role: string | null;
    }>
  >;
};

/** Locks the game's classified rows, then writes one frozen role. Never reads scores. */
async function assignAssessmentRole(
  tx: RoleSql,
  input: {
    analysisId: string;
    status: string;
    cutoffAt: string;
    gameId: string;
    kickoffAt: string;
  },
) {
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
  let role: "primary" | "refresh" | "ineligible";
  let reason: string;
  let primaryId: string | null = null;
  if (!pregame) {
    role = "ineligible";
    reason = input.status === "completed" ? AFTER_KICKOFF_REASON : NOT_COMPLETED_REASON;
  } else if (!primary || primary.id === input.analysisId) {
    role = "primary";
    reason = PRIMARY_REASON;
  } else {
    role = "refresh";
    reason = REFRESH_REASON;
    primaryId = primary.id;
  }
  await tx.unsafe(
    `UPDATE analyses
     SET assessment_role = $2, assessment_role_reason = $3, primary_analysis_id = $4
     WHERE id = $1 AND assessment_role IS NULL`,
    [input.analysisId, role, reason, primaryId],
  );
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
