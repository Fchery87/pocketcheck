import { createHash, randomUUID } from "node:crypto";
import { BoardError, parseGameBoard, type BoardMoneylineInput } from "#lib/domain/board.ts";
import type { Market, Offer } from "#lib/domain/offer.ts";
import type { ScheduledGame } from "../sources/contracts.ts";
import type { FrozenMarketResult, GameBoard, GameBoardStore } from "./board-store.ts";
import { noSources, type EvidenceCollector } from "./evidence.ts";
import { gameHasStarted } from "./games.ts";
import { gatherEvidence } from "./gather-evidence.ts";
import { noModel, type ModelSource, type RunModel } from "./model.ts";
import { calculateModelPick } from "./model-pick.ts";
import { redactText } from "./redact.ts";
import { snapshot, type ForecastSource, type ManualEvidenceInput } from "./run.ts";
import type { PrivateLean } from "./store.ts";
import { createManualEvidence } from "../sources/manual.ts";
import type { EvidenceItem } from "../sources/contracts.ts";

export type GameBoardRequest = {
  /** Stable browser-generated submission identifier, reused only to retry this exact board. */
  requestId?: string;
  game: ScheduledGame;
  /** Decision cutoff for this board. Evidence after it is excluded. */
  nowIso: string;
  /** When the schedule file this game came from was retrieved. Defaults to the run time. */
  scheduleRetrievedAt?: string;
  sportsbook: string;
  observedAt: string;
  moneyline?: BoardMoneylineInput;
  parentId?: string | null;
  /** Optional evidence entered with the board. Entry time is the board's cutoff. */
  manualEvidence?: ManualEvidenceInput[];
  /** Optional private lean. Saved beside the board, never in a model pick or the evidence. */
  lean?: string;
  rationale?: string;
};

export type GameBoardDependencies = {
  store: GameBoardStore;
  collect?: EvidenceCollector;
  model?: ModelSource;
  forecast?: ForecastSource;
};

export type GameBoardOutcome =
  | { ok: true; board: GameBoard }
  | { ok: false; error: string; board?: GameBoard };

type Computed = Extract<RunModel, { status: "computed" }>;

async function price(
  model: ModelSource,
  game: ScheduledGame,
  nowIso: string,
  offer: Offer,
): Promise<RunModel> {
  try {
    return await model(game, nowIso, offer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "unavailable",
      reason: `The forecasting model could not price this market: ${redactText(message)}`,
    };
  }
}

/** A forecast trained through this game, or after the cutoff, is leaked and never a model pick. */
function leakReason(model: Computed, game: ScheduledGame, nowIso: string): string | null {
  const trained = Date.parse(model.artifact.trainingCutoff);
  if (!(trained < Date.parse(game.kickoff))) {
    return `The forecasting model was trained on games through ${model.artifact.trainingCutoff}, which includes this game.`;
  }
  if (trained > Date.parse(nowIso)) {
    return "The forecasting model was trained after this board's decision cutoff.";
  }
  return null;
}

async function pickMarket(input: {
  market: Market;
  offers: [Offer, Offer];
  game: ScheduledGame;
  nowIso: string;
  materialEvidenceMissing: boolean;
  model: ModelSource;
  forecast?: ForecastSource;
}): Promise<FrozenMarketResult> {
  const { market, offers, game, nowIso } = input;
  const priced = await Promise.all(offers.map((offer) => price(input.model, game, nowIso, offer)));
  const [first, second] = priced;
  if (first!.status !== "computed") return { market, noPickReason: first!.reason };
  if (second!.status !== "computed") return { market, noPickReason: second!.reason };
  if (first.artifact.checksum !== second.artifact.checksum) {
    return { market, noPickReason: "The two sides were priced by different forecasting models." };
  }
  const leaked = leakReason(first, game, nowIso);
  if (leaked) return { market, noPickReason: leaked };
  const conservative = (model: Computed) =>
    model.uncertainty.available ? model.uncertainty.probabilities : null;
  const calculation = calculateModelPick({
    market,
    sides: [
      { offer: offers[0], probabilities: first.probabilities, conservative: conservative(first) },
      { offer: offers[1], probabilities: second.probabilities, conservative: conservative(second) },
    ],
    released: first.eligible && second.eligible,
    materialEvidenceMissing: input.materialEvidenceMissing,
  });
  const pickedIndex = offers[0].selection === calculation.pickedSelection ? 0 : 1;
  const forecast = input.forecast
    ? await input.forecast(game, nowIso, offers[pickedIndex], priced[pickedIndex]!)
    : null;
  const { checksum, version, trainingCutoff, releaseStatus, releasedMarkets } = first.artifact;
  return {
    market,
    pick: {
      parentPickId: null,
      forecastingModel: { checksum, version, trainingCutoff, releaseStatus, releasedMarkets },
      calculation,
      forecast,
    },
  };
}

/**
 * Freezes a game board and one model pick per entered market. The board is saved before
 * evidence collection and its model picks before it finishes, so a later failure keeps them.
 */
export async function runGameBoard(
  request: GameBoardRequest,
  { store, collect = noSources, model = noModel, forecast }: GameBoardDependencies,
): Promise<GameBoardOutcome> {
  if (gameHasStarted(request.game, request.nowIso)) {
    return { ok: false, error: "The game has already started" };
  }
  let markets;
  try {
    markets = parseGameBoard({
      gameId: request.game.id,
      kickoffAt: request.game.kickoff,
      sportsbook: request.sportsbook,
      observedAt: request.observedAt,
      moneyline: request.moneyline,
    });
  } catch (error) {
    if (error instanceof BoardError) return { ok: false, error: error.message };
    throw error;
  }

  let manual: EvidenceItem[];
  try {
    manual = (request.manualEvidence ?? []).map((entry) =>
      createManualEvidence({
        text: entry.text,
        url: entry.url,
        sourceTime: entry.sourceTime,
        enteredAt: request.nowIso,
        ...(entry.covers ? { covers: entry.covers } : {}),
        ...(entry.team ? { team: entry.team } : {}),
      }),
    );
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid manual evidence" };
  }
  const leanText = request.lean?.trim() ?? "";
  const leanRationale = request.rationale?.trim() ?? "";
  const lean: PrivateLean | null =
    leanText || leanRationale ? { text: leanText, rationale: leanRationale } : null;

  const scheduleRetrievedAt = request.scheduleRetrievedAt ?? request.nowIso;
  const identity = {
    manualEvidence: manual,
    lean,
    game: snapshot(request.game),
    parentId: request.parentId ?? null,
    cutoffAt: request.nowIso,
    sportsbook: request.sportsbook,
    observedAt: request.observedAt,
    markets,
    scheduleRetrievedAt,
  };
  const hash = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  const begun = await store.beginBoard({
    request: { id: request.requestId ?? randomUUID(), hash },
    parentId: identity.parentId,
    game: identity.game,
    sportsbook: request.sportsbook,
    observedAt: request.observedAt,
    cutoffAt: request.nowIso,
    markets,
    lean,
  });
  if (begun.kind === "conflict") return { ok: false, error: begun.error };
  if (begun.kind === "existing") {
    const board = begun.board;
    if (board.status === "completed") return { ok: true, board };
    const error =
      board.status === "failed"
        ? (board.failureReason ?? "This board failed. Start a new board to retry.")
        : "This board was already started and was not replayed. Start a new board to retry.";
    return { ok: false, error, board };
  }

  const boardId = begun.board.id;
  try {
    const gathered = await gatherEvidence({
      game: request.game,
      nowIso: request.nowIso,
      scheduleRetrievedAt,
      collect,
      carried: [],
      manual,
    });
    const results: FrozenMarketResult[] = [];
    for (const entry of markets) {
      results.push(
        await pickMarket({
          market: entry.market,
          offers: entry.offers,
          game: request.game,
          nowIso: request.nowIso,
          materialEvidenceMissing: gathered.materialEvidenceMissing,
          model,
          forecast,
        }),
      );
    }
    await store.freezeModelPicks({
      boardId,
      evidence: gathered.items,
      gaps: gathered.gaps,
      markets: results,
    });
    const board = await store.finishBoard({ boardId, status: "completed", failureReason: null });
    return { ok: true, board };
  } catch (error) {
    const reason = redactText(error instanceof Error ? error.message : String(error));
    const board = await store.finishBoard({ boardId, status: "failed", failureReason: reason });
    return { ok: false, error: reason, board };
  }
}
