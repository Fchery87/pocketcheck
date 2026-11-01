import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  decideExplanationWrite,
  projectBoardExplanation,
  type ExplanationEvent,
  type ExplanationState,
  type ExplanationWriteResult,
  type BeginExplanation,
  type RequestIntent,
  type SavedExplanationResponse,
  type FinishExplanation,
  type ExplanationCommand,
} from "./board-explanation.ts";
export type { ExplanationEvent, ExplanationState } from "./board-explanation.ts";
import {
  provesAnchorPair,
  type BoardPricing,
  type BoardQuoteResult,
  type PricedMarket,
} from "#lib/domain/board.ts";
import type { Market, Offer } from "#lib/domain/offer.ts";
import { requireFinalScores } from "#lib/domain/settlement.ts";
import type { EvidenceItem } from "../sources/contracts.ts";
import type { SavedForecast } from "./forecast-record.ts";
import type { ProtocolRegistration } from "../models/protocol.ts";
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
  /**
   * The executable offers a model pick is graded and a bet is placed from, home (or over) first,
   * each naming the anchor's other side as its opposing price. A side can be a shopped price.
   */
  offers: [Offer, Offer];
  /** Extra sportsbook quotes. A quote on a different line is another contract, not a better price. */
  quotes: BoardQuoteResult[];
  /**
   * The anchor pair with its pricing format. Absent on a market saved before it was recorded;
   * `anchorPairOf` recovers that older anchor only from saved prices that prove it.
   */
  pricing?: BoardPricing;
  /** Null until the model picks are frozen, and null when the market has no model pick. */
  pick: ModelPick | null;
  /** Why this market has no model pick. Null while a pick exists or before computing. */
  noPickReason: string | null;
};

export type GameBoard = {
  id: string;
  /** Submission identifier and the hash of every input that identifies this board. */
  request: {
    id: string;
    hash: string;
    protocolRegistrationId?: string;
    explanationFormatVersion?: 2;
    lifecycleFormat?: "forecast-first-v1";
  };
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
  /** Set once when a finished board is withdrawn from performance. Never cleared. */
  withdrawal: BoardWithdrawal | null;
  createdAt: string;
  completedAt: string | null;
  explanationState?: ExplanationState;
};

export type BoardWithdrawal = { reason: string; at: string };

export const WITHDRAW_UNFINISHED = "Only a finished game board can be withdrawn.";
export const WITHDRAW_NEEDS_REASON = "Say why this board is withdrawn.";

export type BoardDrafter = { id: string; modelId: string };

export class BoardBeginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoardBeginError";
  }
}

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
  /** A new market always records its anchor pair. */
  markets: Array<
    Pick<PricedMarket, "market" | "offers" | "pricing"> & {
      quotes?: BoardQuoteResult[];
    }
  >;
};

/**
 * Refuses a new market without one sportsbook's anchor pair on the executable contracts. Older
 * markets are restored as saved; only a new write must carry the current pricing format.
 */
export function requireNewMarketPricing(market: NewGameBoard["markets"][number]): void {
  if (!provesAnchorPair(market)) {
    throw new BoardBeginError(
      `A new ${market.market} market needs its anchor pair in the current format.`,
    );
  }
}

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

export function requireForecastCompletion(board: GameBoard, input: FreezeModelPicksInput): void {
  if (board.status === "completed") {
    const saved = {
      evidence: board.evidence,
      gaps: board.gaps,
      markets: board.markets.map((market): FrozenMarketResult => {
        if (!market.pick) return { market: market.market, noPickReason: market.noPickReason! };
        const { parentPickId, forecastingModel, calculation, forecast } = market.pick;
        return {
          market: market.market,
          pick: { parentPickId, forecastingModel, calculation, forecast },
        };
      }),
    };
    const incoming = {
      evidence: input.evidence,
      gaps: input.gaps,
      markets: board.markets.map((market) =>
        input.markets.find((result) => result.market === market.market),
      ),
    };
    if (!isDeepStrictEqual(saved, incoming))
      throw new Error("Conflicting completed forecast inputs.");
  }
  if (board.request.lifecycleFormat !== "forecast-first-v1")
    throw new Error("Atomic forecast completion requires the forecast-first lifecycle.");
  if (isTerminalBoard(board.status) && board.status !== "completed")
    throw new Error("A failed board cannot complete a forecast.");
  if (
    input.markets.length !== board.markets.length ||
    new Set(input.markets.map((market) => market.market)).size !== board.markets.length ||
    board.markets.some((market) => !input.markets.some((result) => result.market === market.market))
  )
    throw new Error("Every board market must resolve exactly once.");
  for (const result of input.markets)
    if (!result.pick && !result.noPickReason.trim())
      throw new Error("An unavailable market needs a reason.");
  if (
    !isTerminalBoard(board.status) &&
    board.markets.some((market) => market.pick || market.noPickReason !== null)
  )
    throw new Error("A market is already frozen.");
}

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
  /** The pick's board was withdrawn from performance. */
  withdrawn: boolean;
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
export const CORRECTION_NOT_LATER =
  "A correction must be recorded later than the notice it corrects.";

/** A backup refuses a correction recorded at or before its notice, so recording refuses it too. */
export function correctionIsLater(prior: { recordedAt: string }, recordedAt: string): boolean {
  return Date.parse(prior.recordedAt) < Date.parse(recordedAt);
}

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
  listBoardExplanationEvents: (boardId: string) => Promise<ExplanationEvent[]>;
  completeBoardForecast: (input: FreezeModelPicksInput) => Promise<GameBoard>;
  beginBoardExplanation: (input: BeginExplanation) => Promise<ExplanationWriteResult>;
  reserveBoardExplanationRequest: (input: RequestIntent) => Promise<ExplanationWriteResult>;
  recordBoardExplanationResponse: (
    input: SavedExplanationResponse,
  ) => Promise<ExplanationWriteResult>;
  finishBoardExplanation: (input: FinishExplanation) => Promise<ExplanationWriteResult>;
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
  /**
   * Withdraws a finished board from performance with a reason. A board is withdrawn once; a repeat
   * returns it with the first reason.
   */
  withdrawBoard: (input: { boardId: string; reason: string }) => Promise<GameBoard>;
};

export const BOARD_CONFLICT =
  "This board submission identifier was already used with different inputs.";

const TERMINAL: readonly GameBoardStatus[] = ["completed", "failed", "interrupted"];

export function isTerminalBoard(status: GameBoardStatus): boolean {
  return TERMINAL.includes(status);
}

export type MemoryBoardStore = GameBoardStore & {
  explanationEvents: Map<string, ExplanationEvent>;
  /** The picked offer, for a closing comparison. Null when the pick is unknown. */
  pickContract: (pickId: string) => OpenPick | null;
  /** Saved boards, used by the journal backup. */
  boards: Map<string, GameBoard>;
  /** Submission identifier to board id, kept with a restored board. */
  submissions: Map<string, string>;
};

export type OpenPick = {
  observedAt: string;
  gameId: string;
  kickoffAt: string;
  market: Market;
  selection: Offer["selection"];
  pointLine: number | null;
  sportsbook: string;
  americanOdds: number;
  rules: Offer["rules"];
};

export function requireBoardRegistration(
  board: Pick<GameBoard, "request" | "cutoffAt"> & {
    markets: Array<{ market: Market }>;
  },
  registration: ProtocolRegistration | undefined,
): void {
  if (!board.request.protocolRegistrationId) return;
  if (
    !registration ||
    registration.id !== board.request.protocolRegistrationId ||
    !Number.isFinite(Date.parse(board.cutoffAt)) ||
    Date.parse(board.cutoffAt) <= Date.parse(registration.registeredAt) ||
    Date.parse(board.cutoffAt) < Date.parse(registration.protocol.period.start) ||
    (registration.protocol.period.end !== null &&
      Date.parse(board.cutoffAt) >= Date.parse(registration.protocol.period.end)) ||
    board.markets.some((market) => !registration.protocol.markets.includes(market.market))
  ) {
    throw new BoardBeginError("A board cannot enroll before its protocol registration.");
  }
}

export function requirePickRegistration(
  board: Pick<GameBoard, "request" | "cutoffAt"> & {
    markets: Array<{ market: Market }>;
  },
  input: FreezeModelPicksInput,
  registration: ProtocolRegistration | undefined,
): void {
  requireBoardRegistration(board, registration);
  for (const result of input.markets) {
    const pick = result.pick;
    if (!pick) continue;
    if (
      pick.forecast?.protocolRegistrationId &&
      pick.forecast.protocolRegistrationId !== board.request.protocolRegistrationId
    ) {
      throw new Error("The forecast protocol registration does not match its board.");
    }
    if (
      registration &&
      (pick.forecastingModel.checksum !== registration.protocol.artifactChecksum ||
        (pick.forecast &&
          (pick.forecast.artifact.checksum !== registration.protocol.artifactChecksum ||
            pick.forecast.protocolRegistrationId !== registration.id ||
            pick.forecast.decisionCutoff !== board.cutoffAt ||
            pick.forecast.inputAvailability.version !== registration.protocol.inputAvailability ||
            pick.forecast.marketEligibility.market !== result.market)))
    ) {
      throw new Error("The forecast artifact or cutoff does not match its protocol registration.");
    }
  }
}

export function createMemoryBoardStore(
  notices: StoredNotice[] = [],
  registrations: ProtocolRegistration[] = [],
  options: { now?: () => string } = {},
): MemoryBoardStore {
  const now = options.now ?? (() => new Date().toISOString());
  const boards = new Map<string, GameBoard>();
  const submissions = new Map<string, string>();
  const finishChains = new Map<string, Promise<unknown>>();
  const explanationEvents = new Map<string, ExplanationEvent>();
  function explanationWrite(command: ExplanationCommand): ExplanationWriteResult {
    const board = require(command.boardId);
    if (
      [...explanationEvents.values()].some(
        (event) =>
          event.boardId !== board.id &&
          (event.attemptId === command.attemptId ||
            (command.kind === "request-intent" &&
              event.kind === "request-intent" &&
              event.requestId === command.requestId)),
      )
    )
      return {
        kind: "conflict",
        error: "The explanation attempt or request identity belongs to another board.",
      };
    const events = [...explanationEvents.values()]
      .filter((event) => event.boardId === board.id)
      .sort((a, b) => a.sequence - b.sequence);
    const result = decideExplanationWrite(board, events, command, now());
    if (result.kind === "acquired")
      explanationEvents.set(result.event.id, structuredClone(result.event));
    return structuredClone(result);
  }

  function project(board: GameBoard): GameBoard {
    return structuredClone(projectBoardExplanation(board, [...explanationEvents.values()]));
  }

  function require(id: string): GameBoard {
    const board = boards.get(id);
    if (!board) throw new Error(`Game board not found: ${id}`);
    return board;
  }

  return {
    boards,
    explanationEvents,
    submissions,
    async listBoardExplanationEvents(boardId) {
      require(boardId);
      return structuredClone(
        [...explanationEvents.values()]
          .filter((event) => event.boardId === boardId)
          .sort((a, b) => a.sequence - b.sequence),
      );
    },
    async beginBoardExplanation(input) {
      return explanationWrite({ kind: "started", ...input });
    },
    async reserveBoardExplanationRequest(input) {
      return explanationWrite({ kind: "request-intent", ...input });
    },
    async recordBoardExplanationResponse(input) {
      return explanationWrite({ kind: "response", ...input });
    },
    async finishBoardExplanation({ boardId, attemptId, outcome }) {
      return explanationWrite({ boardId, attemptId, ...outcome });
    },
    async completeBoardForecast(input) {
      const initial = require(input.boardId);
      const prior = finishChains.get(initial.game.id) ?? Promise.resolve();
      const write = prior.then(() => {
        const board = require(input.boardId);
        requireForecastCompletion(board, input);
        if (isTerminalBoard(board.status)) return project(board);
        requirePickRegistration(
          board,
          input,
          registrations.find((row) => row.id === board.request.protocolRegistrationId),
        );
        const completedAt = now();
        const markets = board.markets.map((market): BoardMarket => {
          const result = input.markets.find((item) => item.market === market.market)!;
          if (!result.pick) return { ...market, noPickReason: result.noPickReason };
          if (
            result.pick.parentPickId !== null &&
            boards.get(board.parentId ?? "")?.markets.find((item) => item.market === market.market)
              ?.pick?.id !== result.pick.parentPickId
          )
            throw new Error("The parent pick must belong to the parent board market.");
          const primary = [...boards.values()]
            .filter((other) => other.game.id === board.game.id)
            .flatMap((other) => other.markets)
            .find(
              (other) => other.market === market.market && other.pick?.role.role === "primary",
            )?.pick;
          return {
            ...market,
            pick: {
              ...result.pick,
              id: randomUUID(),
              boardId: board.id,
              market: market.market,
              createdAt: completedAt,
              role: chooseModelPickRole({
                status: "completed",
                cutoffAt: board.cutoffAt,
                kickoffAt: board.game.kickoff,
                isRefresh: board.parentId !== null,
                primaryPickId: primary?.id ?? null,
              }),
            },
          };
        });
        const updated: GameBoard = structuredClone({
          ...board,
          evidence: input.evidence,
          gaps: input.gaps,
          markets,
          status: "completed",
          completedAt,
        });
        boards.set(board.id, updated);
        return project(updated);
      });
      finishChains.set(
        initial.game.id,
        write.then(
          () => undefined,
          () => undefined,
        ),
      );
      return write;
    },
    async beginBoard(input) {
      const existingId = submissions.get(input.request.id);
      if (existingId) {
        const existing = require(existingId);
        if (existing.request.hash !== input.request.hash) {
          return { kind: "conflict", error: BOARD_CONFLICT };
        }
        return { kind: "existing", board: project(existing) };
      }
      if (input.parentId && !boards.has(input.parentId)) {
        throw new Error(`Parent game board not found: ${input.parentId}`);
      }
      input.markets.forEach(requireNewMarketPricing);
      requireBoardRegistration(
        input,
        registrations.find((row) => row.id === input.request.protocolRegistrationId),
      );
      const board: GameBoard = structuredClone({
        ...input,
        id: randomUUID(),
        status: "pending" as const,
        markets: input.markets.map((market) => ({
          ...market,
          quotes: market.quotes ?? [],
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
        withdrawal: null,
        createdAt: now(),
        completedAt: null,
      });
      boards.set(board.id, board);
      submissions.set(input.request.id, board.id);
      return { kind: "created", board: project(board) };
    },
    async freezeModelPicks(input) {
      const board = require(input.boardId);
      if (board.request.lifecycleFormat)
        throw new Error("Use completeBoardForecast for a forecast-first board.");
      requirePickRegistration(
        board,
        input,
        registrations.find((row) => row.id === board.request.protocolRegistrationId),
      );
      if (isTerminalBoard(board.status)) {
        throw new Error("A finished game board cannot freeze new model picks.");
      }
      for (const result of input.markets) {
        if (!board.markets.some((market) => market.market === result.market)) {
          throw new Error(`The board has no ${result.market} market.`);
        }
      }
      const createdAt = now();
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
      return project(updated);
    },
    async saveBoardDraft(input) {
      const board = require(input.boardId);
      if (board.request.lifecycleFormat)
        throw new Error("Use explanation events for a forecast-first board.");
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
      return project(updated);
    },
    async finishBoard(input) {
      const board = require(input.boardId);
      const prior = finishChains.get(board.game.id) ?? Promise.resolve();
      const write = prior.then(async () => {
        const current = require(input.boardId);
        if (isTerminalBoard(current.status)) return project(current);
        if (current.request.lifecycleFormat && input.status === "completed")
          throw new Error("Use completeBoardForecast for a forecast-first board.");
        const completedAt = now();
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
        return project(updated);
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
      return board ? project(board) : null;
    },
    async recordGameSettlement(input) {
      requireFinalScores(input);
      if (![...boards.values()].some((board) => board.game.id === input.gameId)) {
        throw new Error(`Game not found: ${input.gameId}`);
      }
      if (input.correctsNoticeId && !input.reason?.trim()) {
        return { kind: "conflict", error: "A correction requires a reason." };
      }
      const corrected = input.correctsNoticeId
        ? notices.find((item) => item.id === input.correctsNoticeId)
        : undefined;
      if (input.correctsNoticeId && (!corrected || corrected.gameId !== input.gameId)) {
        throw new Error(`Settlement not found: ${input.correctsNoticeId}`);
      }
      const payloadKey = gameSettlementPayloadKey(input);
      const sameEvent = notices.filter((item) => item.eventId === input.eventId);
      if (sameEvent.length > 0) {
        const match = sameEvent.find((item) => item.payloadKey === payloadKey);
        if (match) return { kind: "duplicate", noticeId: match.id };
        return { kind: "conflict", error: SETTLEMENT_EVENT_CONFLICT };
      }
      if (corrected && !correctionIsLater(corrected, input.recordedAt)) {
        return { kind: "conflict", error: CORRECTION_NOT_LATER };
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
        .map(project);
    },
    async getBoardForPick(pickId) {
      const board = [...boards.values()].find((item) =>
        item.markets.some((market) => market.pick?.id === pickId),
      );
      return board ? project(board) : null;
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
              withdrawn: board.withdrawal !== null,
              game: structuredClone(board.game),
              observedAt: board.observedAt,
              offer: structuredClone(offer),
              grade,
            },
          ];
        });
      });
    },
    async withdrawBoard(input) {
      const board = require(input.boardId);
      if (board.withdrawal) return project(board);
      if (!isTerminalBoard(board.status)) throw new Error(WITHDRAW_UNFINISHED);
      const reason = input.reason.trim();
      if (!reason) throw new Error(WITHDRAW_NEEDS_REASON);
      const updated: GameBoard = {
        ...board,
        withdrawal: { reason, at: now() },
      };
      boards.set(board.id, updated);
      return project(updated);
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
            observedAt: offer.observedAt,
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
