import { randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import type { Market, Offer } from "#lib/domain/offer.ts";
import type { EvidenceItem } from "../sources/contracts.ts";
import {
  BOARD_CONFLICT,
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
import type { RunGame } from "./store.ts";

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
          observed_at, kickoff_at, cutoff_at, status, lean_text, lean_rationale
        ) VALUES (
          ${id}, ${input.request.id}, ${input.request.hash}, ${input.parentId},
          ${gameRow!.id}, ${tx.json(game as never)}, ${input.sportsbook},
          ${input.observedAt}, ${game.kickoff}, ${input.cutoffAt}, 'pending',
          ${input.lean?.text ?? null}, ${input.lean ? input.lean.rationale : null}
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
    async finishBoard(input) {
      await sql`
        UPDATE game_boards
        SET status = ${input.status}, failure_reason = ${input.failureReason},
          completed_at = now()
        WHERE id = ${input.boardId} AND completed_at IS NULL
      `;
      return require(sql, input.boardId);
    },
    async getBoard(id) {
      return read(sql, id);
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
