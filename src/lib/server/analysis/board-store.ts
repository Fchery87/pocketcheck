import { randomUUID } from "node:crypto";
import type { Market, Offer } from "#lib/domain/offer.ts";
import type { EvidenceItem } from "../sources/contracts.ts";
import type { SavedForecast } from "./forecast-record.ts";
import type { ModelPickCalculation } from "./model-pick.ts";
import type { RunGame } from "./store.ts";

/**
 * Game board store contract.
 *
 * A game board is its own journal record, never copied into an analysis snapshot. It is saved
 * pending before evidence collection, its model picks are frozen before any drafting, and it is
 * immutable once it reaches a terminal status. Each model pick is append-only.
 */

export type GameBoardStatus = "pending" | "running" | "completed" | "failed" | "interrupted";

/** The forecasting model that produced a model pick, kept apart from any drafter identity. */
export type ForecastingModelIdentity = {
  checksum: string;
  version: number;
  trainingCutoff: string;
  releaseStatus: "unreleased" | "released-experimental";
  releasedMarkets: Market[];
};

export type ModelPick = {
  id: string;
  boardId: string;
  market: Market;
  /** The parent board's model pick in the same market. Null for a board without a parent. */
  parentPickId: string | null;
  forecastingModel: ForecastingModelIdentity;
  calculation: ModelPickCalculation;
  /** The frozen prospective forecast for the picked side. Null when none was captured. */
  forecast: SavedForecast | null;
  createdAt: string;
};

export type BoardMarket = {
  market: Market;
  /** Home (or over) first, then away (or under), each with the other as its opposing price. */
  offers: [Offer, Offer];
  /** Null until the model picks are frozen, and null when the market has no model pick. */
  pick: ModelPick | null;
  /** Why this market has no model pick. Null while a pick exists or before computing. */
  noPickReason: string | null;
};

export type GameBoard = {
  id: string;
  /** Submission identifier and the hash of every input that identifies this board. */
  request: { id: string; hash: string };
  parentId: string | null;
  status: GameBoardStatus;
  game: RunGame;
  sportsbook: string;
  observedAt: string;
  /** Decision cutoff: evidence after this instant was excluded. */
  cutoffAt: string;
  markets: BoardMarket[];
  evidence: EvidenceItem[];
  gaps: string[];
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type NewGameBoard = Pick<
  GameBoard,
  "request" | "parentId" | "game" | "sportsbook" | "observedAt" | "cutoffAt"
> & { markets: Array<Pick<BoardMarket, "market" | "offers">> };

export type BeginBoardResult =
  | { kind: "created"; board: GameBoard }
  | { kind: "existing"; board: GameBoard }
  | { kind: "conflict"; error: string };

export type NewModelPick = Pick<
  ModelPick,
  "parentPickId" | "forecastingModel" | "calculation" | "forecast"
>;

export type FrozenMarketResult =
  | { market: Market; pick: NewModelPick; noPickReason?: undefined }
  | { market: Market; pick?: undefined; noPickReason: string };

export type FreezeModelPicksInput = {
  boardId: string;
  evidence: EvidenceItem[];
  gaps: string[];
  markets: FrozenMarketResult[];
};

export type FinishBoardInput = {
  boardId: string;
  status: "completed" | "failed";
  failureReason: string | null;
};

export type GameBoardStore = {
  /** Saves a pending board with its entered prices. Same id and inputs return the saved board. */
  beginBoard: (input: NewGameBoard) => Promise<BeginBoardResult>;
  /** Saves evidence, gaps, and the frozen model picks. Each market is frozen once. */
  freezeModelPicks: (input: FreezeModelPicksInput) => Promise<GameBoard>;
  /** Moves a board to a terminal status. A finished board is returned unchanged. */
  finishBoard: (input: FinishBoardInput) => Promise<GameBoard>;
  getBoard: (id: string) => Promise<GameBoard | null>;
};

export const BOARD_CONFLICT =
  "This board submission identifier was already used with different inputs.";

const TERMINAL: readonly GameBoardStatus[] = ["completed", "failed", "interrupted"];

export function isTerminalBoard(status: GameBoardStatus): boolean {
  return TERMINAL.includes(status);
}

export function createMemoryBoardStore(): GameBoardStore {
  const boards = new Map<string, GameBoard>();
  const submissions = new Map<string, string>();

  function require(id: string): GameBoard {
    const board = boards.get(id);
    if (!board) throw new Error(`Game board not found: ${id}`);
    return board;
  }

  return {
    async beginBoard(input) {
      const existingId = submissions.get(input.request.id);
      if (existingId) {
        const existing = require(existingId);
        if (existing.request.hash !== input.request.hash) {
          return { kind: "conflict", error: BOARD_CONFLICT };
        }
        return { kind: "existing", board: structuredClone(existing) };
      }
      if (input.parentId && !boards.has(input.parentId)) {
        throw new Error(`Parent game board not found: ${input.parentId}`);
      }
      const board: GameBoard = structuredClone({
        ...input,
        id: randomUUID(),
        status: "pending" as const,
        markets: input.markets.map((market) => ({ ...market, pick: null, noPickReason: null })),
        evidence: [],
        gaps: [],
        failureReason: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
      });
      boards.set(board.id, board);
      submissions.set(input.request.id, board.id);
      return { kind: "created", board: structuredClone(board) };
    },
    async freezeModelPicks(input) {
      const board = require(input.boardId);
      if (isTerminalBoard(board.status)) {
        throw new Error("A finished game board cannot freeze new model picks.");
      }
      for (const result of input.markets) {
        if (!board.markets.some((market) => market.market === result.market)) {
          throw new Error(`The board has no ${result.market} market.`);
        }
      }
      const createdAt = new Date().toISOString();
      const markets = board.markets.map((market) => {
        const result = input.markets.find((item) => item.market === market.market);
        if (!result) return market;
        if (market.pick || market.noPickReason !== null) {
          throw new Error(`The ${market.market} model pick is already frozen.`);
        }
        if (result.pick) {
          const pick: ModelPick = {
            ...result.pick,
            id: randomUUID(),
            boardId: board.id,
            market: market.market,
            createdAt,
          };
          return { ...market, pick };
        }
        return { ...market, noPickReason: result.noPickReason! };
      });
      const updated: GameBoard = structuredClone({
        ...board,
        status: "running" as const,
        evidence: input.evidence,
        gaps: input.gaps,
        markets,
      });
      boards.set(board.id, updated);
      return structuredClone(updated);
    },
    async finishBoard(input) {
      const board = require(input.boardId);
      if (isTerminalBoard(board.status)) return structuredClone(board);
      const updated: GameBoard = {
        ...board,
        status: input.status,
        failureReason: input.failureReason,
        completedAt: new Date().toISOString(),
      };
      boards.set(board.id, updated);
      return structuredClone(updated);
    },
    async getBoard(id) {
      const board = boards.get(id);
      return board ? structuredClone(board) : null;
    },
  };
}
