import { randomUUID } from "node:crypto";
import type { Sql } from "postgres";
import { americanToDecimal } from "#lib/domain/odds.ts";
import type { Offer } from "#lib/domain/offer.ts";
import type { Settlement as SettlementResult } from "#lib/domain/settlement.ts";

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
};

export type AnalysisRecord = {
  id: string;
  offerId: string;
  parentId: string | null;
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
  evidenceIds: string[];
};

export type ReportRecord = {
  id: string;
  analysisId: string;
  claims: unknown;
  thesis: string;
  usage: unknown;
  renderedText: string;
  completedAt: string;
};

export type UserResearchRecord = {
  id: string;
  analysisId: string;
  lean: string | null;
  rationale: string | null;
};

export type BetRecord = {
  id: string;
  offerId: string;
  analysisId: string | null;
  americanOdds: number;
  decimalOdds: number;
  placedAt: string;
  stakeUnits: number;
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
  evidence: Array<Omit<EvidenceRecord, "id" | "completedAt"> & { id?: string }>;
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
  };
  report?: {
    claims: unknown;
    thesis: string;
    usage?: unknown;
    renderedText: string;
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
  constructor(private readonly sql: Sql) {}

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
            evidence_packet_hash, provider, model, failure_reason, idempotency_key, completed_at
          ) VALUES (
            ${analysisId}, ${offerId}, ${input.analysis.parentId ?? null}, ${input.analysis.cutoffAt},
            ${input.analysis.status}, ${input.analysis.conclusion ?? null},
            ${input.analysis.methodVersion ?? null}, ${input.analysis.policyVersion ?? null},
            ${input.analysis.schemaVersion ?? null}, ${input.analysis.promptVersion ?? null},
            ${input.analysis.evidencePacketHash ?? null}, ${input.analysis.provider ?? null},
            ${input.analysis.model ?? null}, ${input.analysis.failureReason ?? null},
            ${input.analysis.idempotencyKey ?? null},
            ${completed ? completedAt : null}
          )
        `;

        for (let index = 0; index < input.evidence.length; index += 1) {
          const item = input.evidence[index]!;
          await tx`
            INSERT INTO evidence (
              id, source_id, source_url, retrieved_at, published_at, effective_at,
              checksum, body, origin, completeness, completed_at
            ) VALUES (
              ${evidenceIds[index]}, ${item.sourceId}, ${item.sourceUrl}, ${item.retrievedAt},
              ${item.publishedAt}, ${item.effectiveAt}, ${item.checksum},
              ${tx.json(item.body as never)}, ${item.origin}, ${item.completeness},
              ${completed ? completedAt : null}
            )
          `;
          await tx`
            INSERT INTO analysis_evidence (analysis_id, evidence_id, completeness)
            VALUES (${analysisId}, ${evidenceIds[index]}, ${item.completeness})
          `;
        }

        if (input.report) {
          await tx`
            INSERT INTO reports (id, analysis_id, claims, thesis, usage, rendered_bytes, completed_at)
            VALUES (
              ${randomUUID()}, ${analysisId}, ${tx.json(input.report.claims as never)},
              ${input.report.thesis},
              ${input.report.usage ? tx.json(input.report.usage as never) : null},
              ${Buffer.from(input.report.renderedText, "utf8")}, ${completedAt}
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

  async readRun(analysisId: string) {
    const analysis = await this.readAnalysis(analysisId);
    if (!analysis) throw new Error(`Analysis not found: ${analysisId}`);
    const offer = await this.readOffer(analysis.offerId);
    if (!offer) throw new Error(`Offer not found: ${analysis.offerId}`);
    const game = await this.readGameForOffer(analysis.offerId);
    if (!game) throw new Error(`Game not found for offer: ${analysis.offerId}`);
    return {
      game,
      offer,
      evidence: await this.readEvidenceForAnalysis(analysisId),
      analysis,
      report: await this.readReport(analysisId),
      userResearch: await this.readUserResearch(analysisId),
    };
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
    americanOdds: number;
    placedAt: string;
    stakeUnits: number;
  }): Promise<BetRecord> {
    const id = randomUUID();
    await this.sql`
      INSERT INTO bets (id, offer_id, analysis_id, american_odds, decimal_odds, placed_at, stake_units)
      VALUES (
        ${id}, ${input.offerId}, ${input.analysisId ?? null}, ${input.americanOdds},
        ${americanToDecimal(input.americanOdds)}, ${input.placedAt}, ${input.stakeUnits}
      )
    `;
    const bet = await this.readBet(id);
    if (!bet) throw new Error("Bet was not persisted");
    return bet;
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
      ? await this.sql<ResearchRow[]>`SELECT * FROM user_research WHERE analysis_id = ANY(${ids}::uuid[])`
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

  async restoreJournal(snapshot: JournalExport): Promise<JournalExport> {
    const gameIds = new Map(snapshot.games.map((row) => [row.id, randomUUID()]));
    const offerIds = new Map(snapshot.offers.map((row) => [row.id, randomUUID()]));
    const evidenceIds = new Map(snapshot.evidence.map((row) => [row.id, randomUUID()]));
    const analysisIds = new Map(snapshot.analyses.map((row) => [row.id, randomUUID()]));
    const betIds = new Map(snapshot.bets.map((row) => [row.id, randomUUID()]));
    const settlementIds = new Map(snapshot.settlements.map((row) => [row.id, randomUUID()]));

    await this.sql.begin(async (tx) => {
      for (const game of snapshot.games) {
        const id = gameIds.get(game.id)!;
        await tx`
          INSERT INTO games (
            id, source_game_id, season, week, away_team, home_team, kickoff_at, venue, status
          ) VALUES (
            ${id}, ${`${game.sourceGameId}:restored:${id}`}, ${game.season}, ${game.week},
            ${game.awayTeam}, ${game.homeTeam}, ${game.kickoffAt}, ${game.venue}, ${game.status}
          )
        `;
      }
      for (const offer of snapshot.offers) {
        await tx`
          INSERT INTO offers (
            id, game_id, sportsbook, market, selection, point_line, american_odds, decimal_odds,
            observed_at, entered_at, kickoff_at, rules, opposing, completed_at
          ) VALUES (
            ${offerIds.get(offer.id)!}, ${gameIds.get(offer.gameId)!}, ${offer.sportsbook},
            ${offer.market}, ${offer.selection}, ${offer.pointLine}, ${offer.americanOdds},
            ${offer.decimalOdds}, ${offer.observedAt}, ${offer.enteredAt}, ${offer.kickoffAt},
            ${tx.json(offer.rules as never)},
            ${offer.opposing ? tx.json(offer.opposing as never) : null},
            ${offer.completedAt}
          )
        `;
      }
      for (const item of snapshot.evidence) {
        await tx`
          INSERT INTO evidence (
            id, source_id, source_url, retrieved_at, published_at, effective_at,
            checksum, body, origin, completeness, completed_at
          ) VALUES (
            ${evidenceIds.get(item.id)!}, ${item.sourceId}, ${item.sourceUrl}, ${item.retrievedAt},
            ${item.publishedAt}, ${item.effectiveAt}, ${item.checksum}, ${tx.json(item.body as never)},
            ${item.origin}, ${item.completeness}, ${item.completedAt}
          )
        `;
      }
      const ordered = [...snapshot.analyses].sort((left, right) => {
        if (left.parentId === right.id) return 1;
        if (right.parentId === left.id) return -1;
        return 0;
      });
      for (const analysis of ordered) {
        const id = analysisIds.get(analysis.id)!;
        await tx`
          INSERT INTO analyses (
            id, offer_id, parent_id, cutoff_at, status, conclusion,
            method_version, policy_version, schema_version, prompt_version,
            evidence_packet_hash, provider, model, failure_reason, idempotency_key, completed_at
          ) VALUES (
            ${id}, ${offerIds.get(analysis.offerId)!},
            ${analysis.parentId ? analysisIds.get(analysis.parentId) : null},
            ${analysis.cutoffAt}, ${analysis.status}, ${analysis.conclusion},
            ${analysis.methodVersion}, ${analysis.policyVersion}, ${analysis.schemaVersion},
            ${analysis.promptVersion}, ${analysis.evidencePacketHash}, ${analysis.provider},
            ${analysis.model}, ${analysis.failureReason},
            ${analysis.idempotencyKey ? `${analysis.idempotencyKey}:restored:${id}` : null},
            ${analysis.completedAt}
          )
        `;
        for (const evidenceId of analysis.evidenceIds) {
          await tx`
            INSERT INTO analysis_evidence (analysis_id, evidence_id, completeness)
            VALUES (${id}, ${evidenceIds.get(evidenceId)!}, 'restored')
          `;
        }
      }
      for (const report of snapshot.reports) {
        await tx`
          INSERT INTO reports (id, analysis_id, claims, thesis, usage, rendered_bytes, completed_at)
          VALUES (
            ${randomUUID()}, ${analysisIds.get(report.analysisId)!}, ${tx.json(report.claims as never)},
            ${report.thesis}, ${report.usage ? tx.json(report.usage as never) : null},
            ${Buffer.from(report.renderedText, "utf8")}, ${report.completedAt}
          )
        `;
      }
      for (const research of snapshot.userResearch) {
        await tx`
          INSERT INTO user_research (id, analysis_id, lean, rationale)
          VALUES (
            ${randomUUID()}, ${analysisIds.get(research.analysisId)!}, ${research.lean}, ${research.rationale}
          )
        `;
      }
      for (const bet of snapshot.bets) {
        await tx`
          INSERT INTO bets (id, offer_id, analysis_id, american_odds, decimal_odds, placed_at, stake_units)
          VALUES (
            ${betIds.get(bet.id)!}, ${offerIds.get(bet.offerId)!},
            ${bet.analysisId ? analysisIds.get(bet.analysisId) : null},
            ${bet.americanOdds}, ${bet.decimalOdds}, ${bet.placedAt}, ${bet.stakeUnits}
          )
        `;
      }
      const settlementOrder = [...snapshot.settlements].sort((left, right) => {
        if (left.correctsId === right.id) return 1;
        if (right.correctsId === left.id) return -1;
        return 0;
      });
      for (const settlement of settlementOrder) {
        await tx`
          INSERT INTO settlements (
            id, bet_id, offer_id, result, rules, source, reason, settled_at, corrects_id
          ) VALUES (
            ${settlementIds.get(settlement.id)!},
            ${settlement.betId ? betIds.get(settlement.betId) : null},
            ${settlement.offerId ? offerIds.get(settlement.offerId) : null},
            ${settlement.result}, ${settlement.rules}, ${settlement.source}, ${settlement.reason},
            ${settlement.settledAt},
            ${settlement.correctsId ? settlementIds.get(settlement.correctsId) : null}
          )
        `;
      }
    });

    return this.exportJournal([...analysisIds.values()]);
  }

  async forceFailedChildWrite(parentAnalysisId: string): Promise<void> {
    const parent = await this.readAnalysis(parentAnalysisId);
    if (!parent) throw new Error("Parent analysis is missing");
    const offer = await this.readOffer(parent.offerId);
    if (!offer) throw new Error("Parent offer is missing");
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO analyses (
          id, offer_id, parent_id, cutoff_at, status, conclusion, completed_at
        ) VALUES (
          ${randomUUID()}, ${offer.id}, ${parent.id}, ${parent.cutoffAt}, 'completed', 'pass', now()
        )
      `;
      await tx`
        INSERT INTO offers (
          id, game_id, sportsbook, market, selection, american_odds, decimal_odds,
          observed_at, entered_at, kickoff_at, rules
        ) VALUES (
          ${randomUUID()}, ${offer.gameId}, ${offer.sportsbook}, 'moneyline', 'home',
          0, 1, ${offer.observedAt}, ${offer.enteredAt}, ${offer.kickoffAt},
          ${tx.json(offer.rules as never)}
        )
      `;
    });
  }

  private async readGameForOffer(offerId: string): Promise<GameRecord | null> {
    const rows = await this.sql<GameRow[]>`
      SELECT g.* FROM games g JOIN offers o ON o.game_id = g.id WHERE o.id = ${offerId}
    `;
    return rows[0] ? mapGame(rows[0]) : null;
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
      ORDER BY e.created_at ASC
    `;
    return rows.map(mapEvidence);
  }

  private async readReport(analysisId: string): Promise<ReportRecord | null> {
    const rows = await this.sql<ReportRow[]>`SELECT * FROM reports WHERE analysis_id = ${analysisId}`;
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

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
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
};

type AnalysisRow = {
  id: string;
  offer_id: string;
  parent_id: string | null;
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
};

type ReportRow = {
  id: string;
  analysis_id: string;
  claims: unknown;
  thesis: string;
  usage: unknown;
  rendered_bytes: Buffer | Uint8Array;
  completed_at: Date;
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
  american_odds: number;
  decimal_odds: string;
  placed_at: Date;
  stake_units: string;
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
  };
}

function mapAnalysis(row: AnalysisRow, evidenceIds: string[]): AnalysisRecord {
  return {
    id: row.id,
    offerId: row.offer_id,
    parentId: row.parent_id,
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
    evidenceIds,
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
    americanOdds: row.american_odds,
    decimalOdds: num(row.decimal_odds)!,
    placedAt: iso(row.placed_at)!,
    stakeUnits: num(row.stake_units)!,
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
