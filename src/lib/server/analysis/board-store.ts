import { randomUUID } from "node:crypto";
import type { Market, Offer } from "#lib/domain/offer.ts";
import type { EvidenceItem } from "../sources/contracts.ts";
import type { SavedForecast } from "./forecast-record.ts";
import type { PickExplanationReport, ProviderRequestRecord } from "../providers/contracts.ts";
import type { ModelPickCalculation } from "./model-pick.ts";
import {
  chooseModelPickRole,
  unclassifiedPickRole,
  type ModelPickRole,
} from "./model-pick-primary.ts";
import {
  gradeFromNotices,
  type PrivateLean,
  type RunGame,
  type RunUsage,
  type SettlementGrade,
  type SettlementNoticeKind,
  type StoredNotice,
} from "./store.ts";

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
  /**
   * Frozen when the board finishes. Unclassified until then, and unclassified for a pick whose
   * board finished before roles were recorded.
   */
  role: ModelPickRole;
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
  /** The user's own lean. Kept apart from the evidence, the forecast, and every model pick. */
  lean: PrivateLean | null;
  /** The drafter chosen for this board's explanation, kept apart from the forecasting model. */
  drafter: BoardDrafter | null;
  /** Durable provider exchanges for the explanation, including a repair. */
  providerRequests: ProviderRequestRecord[];
  /** True when a sent request has no durable completion and must not be retried automatically. */
  providerOutcomeAmbiguous: boolean;
  /** Combined usage across every known provider request. Null when none was reported. */
  usage: RunUsage | null;
  /** The drafter's validated explanation. Null until a draft passes validation. */
  explanation: PickExplanationReport | null;
  createdAt: string;
  completedAt: string | null;
};

export type BoardDrafter = { id: string; modelId: string };

/** What a board saves once the drafter has answered, before the answer is validated. */
export type BoardDraftAttempt = {
  boardId: string;
  providerRequests: ProviderRequestRecord[];
  providerOutcomeAmbiguous: boolean;
  usage: RunUsage | null;
};

export type NewGameBoard = Pick<
  GameBoard,
  "request" | "parentId" | "game" | "sportsbook" | "observedAt" | "cutoffAt"
> & {
  /** Omitted means no lean. */
  lean?: PrivateLean | null;
  /** Omitted means no drafter is named for this board. */
  drafter?: BoardDrafter | null;
  markets: Array<Pick<BoardMarket, "market" | "offers">>;
};

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
  /** Saved with a completed board only. A failed board keeps its picks and no explanation. */
  explanation?: PickExplanationReport | null;
};

/**
 * A final score is a fact about the game, not about one board, so a game settlement notice is
 * keyed to the game's source identifier. Every board of that game, including a refresh, is graded
 * by the same notices and an event identifier yields one grade. Analysis notices stay keyed to
 * their analysis and share the same event identifier space, so one event never grades twice.
 */
export type RecordGameSettlementInput = {
  eventId: string;
  /** The game's source identifier, as in `RunGame.id`. */
  gameId: string;
  kind: SettlementNoticeKind;
  homeScore?: number | null;
  awayScore?: number | null;
  recordedAt: string;
  source: string;
  reason?: string | null;
  correctsNoticeId?: string | null;
};

export type RecordGameSettlementResult =
  | { kind: "recorded"; noticeId: string }
  | { kind: "duplicate"; noticeId: string }
  | { kind: "conflict"; error: string };

/** A finished board's model pick, with the offer the pick named and the grade of that contract. */
export type ListedModelPick = {
  pick: ModelPick;
  game: RunGame;
  observedAt: string;
  offer: Offer;
  grade: SettlementGrade;
};

export type BoardSettlement = {
  gameId: string;
  /** Each market in board order. The grade is null when the market has no model pick. */
  markets: Array<{
    market: Market;
    pick: ModelPick | null;
    grade: SettlementGrade | null;
  }>;
};

export const SETTLEMENT_EVENT_CONFLICT =
  "This settlement event identifier was already used with different inputs.";

export function gameSettlementPayloadKey(input: RecordGameSettlementInput): string {
  return JSON.stringify({
    eventId: input.eventId,
    gameId: input.gameId,
    kind: input.kind,
    homeScore: input.homeScore ?? null,
    awayScore: input.awayScore ?? null,
    source: input.source,
    reason: input.reason ?? null,
    correctsNoticeId: input.correctsNoticeId ?? null,
  });
}

/** The picked side's own contract: the board offer whose selection the model pick named. */
function pickedOffer(market: BoardMarket): Offer | null {
  const pick = market.pick;
  if (!pick) return null;
  return (
    market.offers.find((offer) => offer.selection === pick.calculation.pickedSelection) ?? null
  );
}

export function gradeBoardMarkets(board: GameBoard, notices: StoredNotice[]): BoardSettlement {
  return {
    gameId: board.game.id,
    markets: board.markets.map((market) => {
      const offer = pickedOffer(market);
      return {
        market: market.market,
        pick: market.pick,
        grade: offer ? gradeFromNotices(offer, notices) : null,
      };
    }),
  };
}

export type GameBoardStore = {
  /** Saves a pending board with its entered prices. Same id and inputs return the saved board. */
  beginBoard: (input: NewGameBoard) => Promise<BeginBoardResult>;
  /** Saves evidence, gaps, and the frozen model picks. Each market is frozen once. */
  freezeModelPicks: (input: FreezeModelPicksInput) => Promise<GameBoard>;
  /**
   * Saves the provider exchanges and usage right after the drafter answers, before validation, so
   * a later failure can finalize from the saved response. Refused once the board is finished.
   */
  saveBoardDraft: (input: BoardDraftAttempt) => Promise<GameBoard>;
  /** Moves a board to a terminal status. A finished board is returned unchanged. */
  finishBoard: (input: FinishBoardInput) => Promise<GameBoard>;
  getBoard: (id: string) => Promise<GameBoard | null>;
  /** Appends a game settlement notice. A correction names the earlier notice and gives a reason. */
  recordGameSettlement: (input: RecordGameSettlementInput) => Promise<RecordGameSettlementResult>;
  /** Grades each model pick on the board from the game's notices. Derived on read, never stored. */
  readBoardSettlement: (boardId: string) => Promise<BoardSettlement>;
  /** Boards that refresh this one, oldest first. A refresh never changes its parent. */
  listRefreshes: (parentId: string) => Promise<GameBoard[]>;
  /** The board that holds a model pick, or null when no such pick exists. */
  getBoardForPick: (pickId: string) => Promise<GameBoard | null>;
  /** Model picks on finished boards, oldest completion first. Unfinished boards stay out. */
  listModelPicks: () => Promise<ListedModelPick[]>;
};

export const BOARD_CONFLICT =
  "This board submission identifier was already used with different inputs.";

const TERMINAL: readonly GameBoardStatus[] = ["completed", "failed", "interrupted"];

export function isTerminalBoard(status: GameBoardStatus): boolean {
  return TERMINAL.includes(status);
}

export type MemoryBoardStore = GameBoardStore & {
  /** The picked offer, for a closing comparison. Null when the pick is unknown. */
  pickContract: (pickId: string) => OpenPick | null;
  /** Saved boards, used by the journal backup. */
  boards: Map<string, GameBoard>;
  /** Submission identifier to board id, kept with a restored board. */
  submissions: Map<string, string>;
};

export type OpenPick = {
  gameId: string;
  kickoffAt: string;
  market: Market;
  selection: Offer["selection"];
  pointLine: number | null;
  sportsbook: string;
  americanOdds: number;
  rules: Offer["rules"];
};

export function createMemoryBoardStore(notices: StoredNotice[] = []): MemoryBoardStore {
  const boards = new Map<string, GameBoard>();
  const submissions = new Map<string, string>();
  const finishChains = new Map<string, Promise<unknown>>();

  function require(id: string): GameBoard {
    const board = boards.get(id);
    if (!board) throw new Error(`Game board not found: ${id}`);
    return board;
  }

  return {
    boards,
    submissions,
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
        markets: input.markets.map((market) => ({
          ...market,
          pick: null,
          noPickReason: null,
        })),
        evidence: [],
        gaps: [],
        failureReason: null,
        lean: input.lean ?? null,
        drafter: input.drafter ?? null,
        providerRequests: [],
        providerOutcomeAmbiguous: false,
        usage: null,
        explanation: null,
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
          if (result.pick.parentPickId !== null) {
            const parent = board.parentId ? boards.get(board.parentId) : undefined;
            const expected = parent?.markets.find((item) => item.market === market.market)?.pick;
            if (!expected || expected.id !== result.pick.parentPickId) {
              throw new Error(
                `The ${market.market} parent pick must be the parent board's pick in that market.`,
              );
            }
          }
          const pick: ModelPick = {
            ...result.pick,
            id: randomUUID(),
            boardId: board.id,
            market: market.market,
            role: unclassifiedPickRole(),
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
    async saveBoardDraft(input) {
      const board = require(input.boardId);
      if (isTerminalBoard(board.status)) {
        throw new Error("A finished game board cannot save a new draft.");
      }
      const updated: GameBoard = structuredClone({
        ...board,
        providerRequests: input.providerRequests,
        providerOutcomeAmbiguous: input.providerOutcomeAmbiguous,
        usage: input.usage,
      });
      boards.set(board.id, updated);
      return structuredClone(updated);
    },
    async finishBoard(input) {
      const board = require(input.boardId);
      const prior = finishChains.get(board.game.id) ?? Promise.resolve();
      const write = prior.then(async () => {
        const current = require(input.boardId);
        if (isTerminalBoard(current.status)) return structuredClone(current);
        const completedAt = new Date().toISOString();
        const markets = current.markets.map((market) => {
          if (!market.pick || market.pick.role.role !== "unclassified") return market;
          const existing = [...boards.values()]
            .flatMap((item) => item.markets)
            .find(
              (item) =>
                item.pick?.role.role === "primary" &&
                item.pick.market === market.market &&
                boards.get(item.pick.boardId)?.game.id === current.game.id,
            );
          return {
            ...market,
            pick: {
              ...market.pick,
              role: chooseModelPickRole({
                status: input.status,
                cutoffAt: current.cutoffAt,
                kickoffAt: current.game.kickoff,
                isRefresh: current.parentId !== null,
                primaryPickId: existing?.pick?.id ?? null,
              }),
            },
          };
        });
        const updated: GameBoard = structuredClone({
          ...current,
          markets,
          status: input.status,
          failureReason: input.failureReason,
          explanation: input.status === "completed" ? (input.explanation ?? null) : null,
          completedAt,
        });
        boards.set(current.id, updated);
        return structuredClone(updated);
      });
      finishChains.set(
        board.game.id,
        write.then(
          () => undefined,
          () => undefined,
        ),
      );
      return write;
    },
    async getBoard(id) {
      const board = boards.get(id);
      return board ? structuredClone(board) : null;
    },
    async recordGameSettlement(input) {
      if (![...boards.values()].some((board) => board.game.id === input.gameId)) {
        throw new Error(`Game not found: ${input.gameId}`);
      }
      if (input.correctsNoticeId) {
        if (!input.reason?.trim()) {
          return { kind: "conflict", error: "A correction requires a reason." };
        }
        const prior = notices.find((item) => item.id === input.correctsNoticeId);
        if (!prior || prior.gameId !== input.gameId) {
          throw new Error(`Settlement not found: ${input.correctsNoticeId}`);
        }
      }
      const payloadKey = gameSettlementPayloadKey(input);
      const sameEvent = notices.filter((item) => item.eventId === input.eventId);
      if (sameEvent.length > 0) {
        const match = sameEvent.find((item) => item.payloadKey === payloadKey);
        if (match) return { kind: "duplicate", noticeId: match.id };
        return { kind: "conflict", error: SETTLEMENT_EVENT_CONFLICT };
      }
      const saved: StoredNotice = {
        id: randomUUID(),
        eventId: input.eventId,
        analysisId: null,
        gameId: input.gameId,
        betId: null,
        kind: input.kind,
        homeScore: input.homeScore ?? null,
        awayScore: input.awayScore ?? null,
        source: input.source,
        reason: input.reason ?? null,
        correctsId: input.correctsNoticeId ?? null,
        recordedAt: input.recordedAt,
        payloadKey,
      };
      notices.push(saved);
      return { kind: "recorded", noticeId: saved.id };
    },
    async readBoardSettlement(boardId) {
      const board = require(boardId);
      return gradeBoardMarkets(
        board,
        notices.filter((item) => item.gameId === board.game.id),
      );
    },
    async listRefreshes(parentId) {
      return [...boards.values()]
        .filter((board) => board.parentId === parentId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map((board) => structuredClone(board));
    },
    async getBoardForPick(pickId) {
      const board = [...boards.values()].find((item) =>
        item.markets.some((market) => market.pick?.id === pickId),
      );
      return board ? structuredClone(board) : null;
    },
    async listModelPicks() {
      const finished = [...boards.values()]
        .filter((board) => isTerminalBoard(board.status))
        .sort((left, right) => (left.completedAt ?? "").localeCompare(right.completedAt ?? ""));
      return finished.flatMap((board): ListedModelPick[] => {
        const settlement = gradeBoardMarkets(
          board,
          notices.filter((item) => item.gameId === board.game.id),
        );
        return board.markets.flatMap((market) => {
          if (!market.pick) return [];
          const offer = market.offers.find(
            (item) => item.selection === market.pick!.calculation.pickedSelection,
          );
          const grade = settlement.markets.find((item) => item.market === market.market)?.grade;
          if (!offer || !grade) return [];
          return [
            {
              pick: structuredClone(market.pick),
              game: structuredClone(board.game),
              observedAt: board.observedAt,
              offer: structuredClone(offer),
              grade,
            },
          ];
        });
      });
    },
    pickContract(pickId) {
      for (const board of boards.values()) {
        for (const market of board.markets) {
          if (market.pick?.id !== pickId) continue;
          const offer = market.offers.find(
            (item) => item.selection === market.pick!.calculation.pickedSelection,
          );
          if (!offer) return null;
          return {
            gameId: board.game.id,
            kickoffAt: board.game.kickoff,
            market: market.market,
            selection: offer.selection,
            pointLine: offer.pointLine,
            sportsbook: board.sportsbook,
            americanOdds: offer.americanOdds,
            rules: offer.rules,
          };
        }
      }
      return null;
    },
  };
}
