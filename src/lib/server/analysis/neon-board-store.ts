import { randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import type { Market, Offer } from "#lib/domain/offer.ts";
import type { EvidenceItem } from "../sources/contracts.ts";
import {
  BOARD_CONFLICT,
  SETTLEMENT_EVENT_CONFLICT,
  gameSettlementPayloadKey,
  gradeBoardMarkets,
  isTerminalBoard,
  type BoardMarket,
  type ForecastingModelIdentity,
  type GameBoard,
  type GameBoardStatus,
  type GameBoardStore,
  type ModelPick,
  type NewGameBoard,
} from "./board-store.ts";
import type { SavedForecast } from "./forecast-record.ts";
import type { ModelPickCalculation } from "./model-pick.ts";
import type { RunGame, RunUsage, StoredNotice } from "./store.ts";
import type { PickExplanationReport, ProviderRequestRecord } from "../providers/contracts.ts";

type BoardRow = {
  id: string;
  submission_id: string;
  request_hash: string;
  parent_id: string | null;
  game: RunGame;
  sportsbook: string;
  observed_at: Date;
  cutoff_at: Date;
  status: GameBoardStatus;
  evidence: EvidenceItem[];
  gaps: string[];
  failure_reason: string | null;
  lean_text: string | null;
  lean_rationale: string | null;
  drafter_id: string | null;
  drafter_model_id: string | null;
  provider_requests: ProviderRequestRecord[];
  provider_outcome_ambiguous: boolean;
  usage: RunUsage | null;
  explanation: PickExplanationReport | null;
  completed_at: Date | null;
  created_at: Date;
};

type MarketRow = {
  market: Market;
  offers: [Offer, Offer];
  no_pick_reason: string | null;
};

type PickRow = {
  id: string;
  board_id: string;
  market: Market;
  parent_pick_id: string | null;
  calculation: ModelPickCalculation;
  forecasting_model: ForecastingModelIdentity;
  forecast: SavedForecast | null;
  created_at: Date;
};

const MARKET_ORDER: Market[] = ["moneyline", "spread", "total"];

function iso(value: Date): string {
  return value.toISOString();
}

/** Game boards in Neon. Same contract as the memory journal's boards. */
export function createNeonBoardStore(sql: Sql): GameBoardStore {
  async function read(db: Sql | TransactionSql, id: string): Promise<GameBoard | null> {
    const [board] = await db<BoardRow[]>`SELECT * FROM game_boards WHERE id = ${id}`;
    if (!board) return null;
    const markets = await db<MarketRow[]>`
      SELECT market, offers, no_pick_reason FROM board_markets WHERE board_id = ${id}
    `;
    const picks = await db<PickRow[]>`SELECT * FROM model_picks WHERE board_id = ${id}`;
    const ordered = [...markets].sort(
      (left, right) => MARKET_ORDER.indexOf(left.market) - MARKET_ORDER.indexOf(right.market),
    );
    return {
      id: board.id,
      request: { id: board.submission_id, hash: board.request_hash },
      parentId: board.parent_id,
      status: board.status,
      game: board.game,
      sportsbook: board.sportsbook,
      observedAt: iso(board.observed_at),
      cutoffAt: iso(board.cutoff_at),
      markets: ordered.map((row): BoardMarket => {
        const pick = picks.find((item) => item.market === row.market);
        return {
          market: row.market,
          offers: row.offers,
          pick: pick ? toPick(pick) : null,
          noPickReason: row.no_pick_reason,
        };
      }),
      evidence: board.evidence,
      gaps: board.gaps,
      failureReason: board.failure_reason,
      lean:
        board.lean_text === null
          ? null
          : { text: board.lean_text, rationale: board.lean_rationale ?? "" },
      drafter:
        board.drafter_id === null
          ? null
          : { id: board.drafter_id, modelId: board.drafter_model_id ?? "" },
      providerRequests: board.provider_requests,
      providerOutcomeAmbiguous: board.provider_outcome_ambiguous,
      usage: board.usage,
      explanation: board.explanation,
      createdAt: iso(board.created_at),
      completedAt: board.completed_at ? iso(board.completed_at) : null,
    };
  }

  async function require(db: Sql | TransactionSql, id: string): Promise<GameBoard> {
    const board = await read(db, id);
    if (!board) throw new Error(`Game board not found: ${id}`);
    return board;
  }

  async function existing(submissionId: string, hash: string) {
    const [row] = await sql<{ id: string; request_hash: string }[]>`
      SELECT id, request_hash FROM game_boards WHERE submission_id = ${submissionId}
    `;
    if (!row) return null;
    if (row.request_hash !== hash) return { kind: "conflict" as const, error: BOARD_CONFLICT };
    return { kind: "existing" as const, board: await require(sql, row.id) };
  }

  async function insert(input: NewGameBoard): Promise<string | null> {
    return sql.begin(async (tx) => {
      const game = input.game;
      await tx`
        INSERT INTO games (
          id, source_game_id, season, week, away_team, home_team, kickoff_at, venue, status
        ) VALUES (
          ${randomUUID()}, ${game.id}, ${game.season}, ${game.week}, ${game.away},
          ${game.home}, ${game.kickoff}, ${game.venue}, 'scheduled'
        )
        ON CONFLICT (source_game_id) DO NOTHING
      `;
      const [gameRow] = await tx<{ id: string }[]>`
        SELECT id FROM games WHERE source_game_id = ${game.id}
      `;
      const id = randomUUID();
      const inserted = await tx<{ id: string }[]>`
        INSERT INTO game_boards (
          id, submission_id, request_hash, parent_id, game_id, game, sportsbook,
          observed_at, kickoff_at, cutoff_at, status, lean_text, lean_rationale,
          drafter_id, drafter_model_id
        ) VALUES (
          ${id}, ${input.request.id}, ${input.request.hash}, ${input.parentId},
          ${gameRow!.id}, ${tx.json(game as never)}, ${input.sportsbook},
          ${input.observedAt}, ${game.kickoff}, ${input.cutoffAt}, 'pending',
          ${input.lean?.text ?? null}, ${input.lean ? input.lean.rationale : null},
          ${input.drafter?.id ?? null}, ${input.drafter?.modelId ?? null}
        )
        ON CONFLICT (submission_id) DO NOTHING
        RETURNING id
      `;
      if (inserted.length === 0) return null;
      for (const market of input.markets) {
        await tx`
          INSERT INTO board_markets (id, board_id, market, offers)
          VALUES (${randomUUID()}, ${id}, ${market.market}, ${tx.json(market.offers as never)})
        `;
      }
      return id;
    });
  }

  return {
    async beginBoard(input) {
      const found = await existing(input.request.id, input.request.hash);
      if (found) return found;
      const id = await insert(input);
      if (id === null) {
        const raced = await existing(input.request.id, input.request.hash);
        if (!raced) throw new Error(`Game board submission vanished: ${input.request.id}`);
        return raced;
      }
      return { kind: "created", board: await require(sql, id) };
    },
    async freezeModelPicks(input) {
      await sql.begin(async (tx) => {
        const [board] = await tx<{ status: GameBoardStatus }[]>`
          SELECT status FROM game_boards WHERE id = ${input.boardId} FOR UPDATE
        `;
        if (!board) throw new Error(`Game board not found: ${input.boardId}`);
        if (isTerminalBoard(board.status)) {
          throw new Error("A finished game board cannot freeze new model picks.");
        }
        for (const result of input.markets) {
          const frozen = await tx<{ id: string }[]>`
            UPDATE board_markets
            SET no_pick_reason = ${result.pick ? null : result.noPickReason}, frozen_at = now()
            WHERE board_id = ${input.boardId} AND market = ${result.market} AND frozen_at IS NULL
            RETURNING id
          `;
          if (frozen.length === 0) {
            throw new Error(
              `The ${result.market} model pick is already frozen or not on the board.`,
            );
          }
          if (!result.pick) continue;
          const pick = result.pick;
          await tx`
            INSERT INTO model_picks (
              id, board_id, market, parent_pick_id, calculation_version, picked_selection,
              strength_grade, release_label, calculation, forecasting_model, forecast
            ) VALUES (
              ${randomUUID()}, ${input.boardId}, ${result.market}, ${pick.parentPickId},
              ${pick.calculation.version}, ${pick.calculation.pickedSelection},
              ${pick.calculation.grade}, ${pick.calculation.release},
              ${tx.json(pick.calculation as never)}, ${tx.json(pick.forecastingModel as never)},
              ${pick.forecast ? tx.json(pick.forecast as never) : null}
            )
          `;
        }
        await tx`
          UPDATE game_boards
          SET status = 'running', evidence = ${tx.json(input.evidence as never)},
            gaps = ${tx.json(input.gaps as never)}
          WHERE id = ${input.boardId}
        `;
      });
      return require(sql, input.boardId);
    },
    async saveBoardDraft(input) {
      const updated = await sql<{ id: string }[]>`
        UPDATE game_boards
        SET provider_requests = ${sql.json(input.providerRequests as never)},
          provider_outcome_ambiguous = ${input.providerOutcomeAmbiguous},
          usage = ${input.usage ? sql.json(input.usage as never) : null}
        WHERE id = ${input.boardId} AND completed_at IS NULL
        RETURNING id
      `;
      if (updated.length === 0) {
        await require(sql, input.boardId);
        throw new Error("A finished game board cannot save a new draft.");
      }
      return require(sql, input.boardId);
    },
    async finishBoard(input) {
      const explanation =
        input.status === "completed" && input.explanation ? input.explanation : null;
      await sql`
        UPDATE game_boards
        SET status = ${input.status}, failure_reason = ${input.failureReason},
          explanation = ${explanation ? sql.json(explanation as never) : null},
          completed_at = now()
        WHERE id = ${input.boardId} AND completed_at IS NULL
      `;
      return require(sql, input.boardId);
    },
    async getBoard(id) {
      return read(sql, id);
    },
    async recordGameSettlement(input) {
      const [game] = await sql<{ id: string }[]>`
        SELECT id FROM games WHERE source_game_id = ${input.gameId}
      `;
      if (!game) throw new Error(`Game not found: ${input.gameId}`);
      if (input.correctsNoticeId) {
        if (!input.reason?.trim()) {
          return { kind: "conflict", error: "A correction requires a reason." };
        }
        const [prior] = await sql<{ game_id: string | null }[]>`
          SELECT game_id FROM settlement_notices WHERE id = ${input.correctsNoticeId}
        `;
        if (!prior || prior.game_id !== game.id) {
          throw new Error(`Settlement not found: ${input.correctsNoticeId}`);
        }
      }
      const payloadKey = gameSettlementPayloadKey(input);
      const find = async () => {
        const [row] = await sql<{ id: string; payload_key: string }[]>`
          SELECT id, payload_key FROM settlement_notices WHERE event_id = ${input.eventId}
        `;
        return row ?? null;
      };
      const settle = (row: { id: string; payload_key: string }) =>
        row.payload_key === payloadKey
          ? ({ kind: "duplicate", noticeId: row.id } as const)
          : ({ kind: "conflict", error: SETTLEMENT_EVENT_CONFLICT } as const);
      const existing = await find();
      if (existing) return settle(existing);
      const id = randomUUID();
      try {
        await sql`
          INSERT INTO settlement_notices (
            id, event_id, game_id, kind, home_score, away_score, source, reason,
            corrects_id, recorded_at, payload_key
          ) VALUES (
            ${id}, ${input.eventId}, ${game.id}, ${input.kind}, ${input.homeScore ?? null},
            ${input.awayScore ?? null}, ${input.source}, ${input.reason ?? null},
            ${input.correctsNoticeId ?? null}, ${input.recordedAt}, ${payloadKey}
          )
        `;
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error && error.code;
        if (code !== "23505") throw error;
        const raced = await find();
        if (raced) return settle(raced);
        throw error;
      }
      return { kind: "recorded", noticeId: id };
    },
    async readBoardSettlement(boardId) {
      const board = await require(sql, boardId);
      const rows = await sql<
        Array<{
          id: string;
          event_id: string;
          kind: StoredNotice["kind"];
          home_score: number | null;
          away_score: number | null;
          source: string;
          reason: string | null;
          corrects_id: string | null;
          recorded_at: Date;
        }>
      >`
        SELECT n.* FROM settlement_notices n
        JOIN games g ON g.id = n.game_id
        WHERE g.source_game_id = ${board.game.id}
        ORDER BY n.recorded_at ASC
      `;
      const notices = rows.map((row): StoredNotice => ({
        id: row.id,
        eventId: row.event_id,
        analysisId: null,
        gameId: board.game.id,
        betId: null,
        kind: row.kind,
        homeScore: row.home_score,
        awayScore: row.away_score,
        source: row.source,
        reason: row.reason,
        correctsId: row.corrects_id,
        recordedAt: iso(row.recorded_at),
        payloadKey: "",
      }));
      return gradeBoardMarkets(board, notices);
    },
    async listRefreshes(parentId) {
      const rows = await sql<{ id: string }[]>`
        SELECT id FROM game_boards WHERE parent_id = ${parentId} ORDER BY created_at, id
      `;
      const boards: GameBoard[] = [];
      for (const row of rows) boards.push(await require(sql, row.id));
      return boards;
    },
    async getBoardForPick(pickId) {
      const [row] = await sql<{ board_id: string }[]>`
        SELECT board_id FROM model_picks WHERE id = ${pickId}
      `;
      return row ? read(sql, row.board_id) : null;
    },
  };
}

function toPick(row: PickRow): ModelPick {
  return {
    id: row.id,
    boardId: row.board_id,
    market: row.market,
    parentPickId: row.parent_pick_id,
    forecastingModel: row.forecasting_model,
    calculation: row.calculation,
    forecast: row.forecast,
    createdAt: iso(row.created_at),
  };
}
