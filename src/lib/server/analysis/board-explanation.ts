import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { BoardDrafter, GameBoard } from "./board-store.ts";
import type { PickExplanationReport, ProviderRequestRecord } from "../providers/contracts.ts";

export type ExplanationOutcome =
  | { kind: "completed"; report: PickExplanationReport }
  | { kind: "failed"; reasons: string[] }
  | { kind: "ambiguous"; reason: string };
export type ExplanationEvent = {
  id: string;
  boardId: string;
  attemptId: string;
  sequence: number;
  recordedAt: string;
} & (
  | { kind: "started"; drafter: BoardDrafter }
  | { kind: "request-intent"; requestId: string; role: "original" | "repair"; bodyHash: string }
  | { kind: "response"; requestId: string; exchange: ProviderRequestRecord }
  | ExplanationOutcome
);
export type ExplanationState =
  | { kind: "not-requested" }
  | { kind: "pending"; attemptId: string }
  | ({ attemptId: string } & ExplanationOutcome);
export type ExplanationWriteResult =
  | { kind: "acquired"; event: ExplanationEvent; state: ExplanationState }
  | { kind: "existing"; event: ExplanationEvent; state: ExplanationState }
  | { kind: "conflict"; error: string };
export type BeginExplanation = { boardId: string; attemptId: string; drafter: BoardDrafter };
export type RequestIntent = {
  bodyHash: string;
  boardId: string;
  attemptId: string;
  requestId: string;
  role: "original" | "repair";
};
export type SavedExplanationResponse = {
  boardId: string;
  attemptId: string;
  requestId: string;
  exchange: ProviderRequestRecord;
};
export type FinishExplanation = { boardId: string; attemptId: string; outcome: ExplanationOutcome };
export type ExplanationCommand =
  | ({ kind: "started" } & BeginExplanation)
  | ({ kind: "request-intent" } & RequestIntent)
  | ({ kind: "response" } & SavedExplanationResponse)
  | ({ boardId: string; attemptId: string } & ExplanationOutcome);

export function explanationState(events: ExplanationEvent[]): ExplanationState {
  const latest = events.at(-1);
  if (!latest) return { kind: "not-requested" };
  const attempt = events.filter((event) => event.attemptId === latest.attemptId);
  const terminal = attempt.find(isExplanationTerminal);
  if (terminal?.kind === "completed")
    return { kind: "completed", attemptId: latest.attemptId, report: terminal.report };
  if (terminal?.kind === "failed")
    return { kind: "failed", attemptId: latest.attemptId, reasons: terminal.reasons };
  if (terminal?.kind === "ambiguous")
    return { kind: "ambiguous", attemptId: latest.attemptId, reason: terminal.reason };
  const unresolved = attempt.find(
    (event) =>
      event.kind === "request-intent" &&
      !attempt.some(
        (response) => response.kind === "response" && response.requestId === event.requestId,
      ),
  );
  if (unresolved)
    return {
      kind: "ambiguous",
      attemptId: latest.attemptId,
      reason: "A reserved provider request has no durable response. It must not be replayed.",
    };
  return { kind: "pending", attemptId: latest.attemptId };
}
export function isExplanationTerminal(event: ExplanationEvent): boolean {
  return event.kind === "completed" || event.kind === "failed" || event.kind === "ambiguous";
}

function content(event: ExplanationEvent | ExplanationCommand): object {
  const { id: _id, sequence: _sequence, recordedAt: _at, ...payload } = event as ExplanationEvent;
  return payload;
}

/** Pure reservation decision shared by memory and PostgreSQL under their board lock. */
export function decideExplanationWrite(
  board: GameBoard,
  events: ExplanationEvent[],
  command: ExplanationCommand,
  recordedAt: string = new Date().toISOString(),
): ExplanationWriteResult {
  const conflict = (error: string): ExplanationWriteResult => ({ kind: "conflict", error });
  if (!command.attemptId.trim()) return conflict("An explanation attempt needs an identity.");
  if (command.kind === "request-intent" && !/^[a-f0-9]{64}$/.test(command.bodyHash))
    return conflict("A provider request requires its SHA256 body hash.");
  if (
    command.kind === "request-intent" &&
    (!command.requestId.trim() || !["original", "repair"].includes(command.role))
  )
    return conflict("A request needs an identity and a supported role.");
  if (
    command.kind === "failed" &&
    (!command.reasons.length || command.reasons.some((reason) => !reason.trim()))
  )
    return conflict("A failed explanation needs a reason.");
  if (command.kind === "ambiguous" && !command.reason.trim())
    return conflict("An ambiguous explanation needs a reason.");
  if (
    command.kind === "completed" &&
    events.some(
      (event) =>
        event.attemptId === command.attemptId &&
        event.kind === "response" &&
        event.exchange.outcome === "ambiguous",
    )
  )
    return conflict("An ambiguous provider outcome cannot complete an explanation.");
  if (board.request.lifecycleFormat !== "forecast-first-v1" || board.status !== "completed")
    return conflict("Explanation attempts require a completed forecast-first board.");
  const attempt = events.filter((event) => event.attemptId === command.attemptId);
  const match = attempt.find((event) =>
    command.kind === "started"
      ? event.kind === "started"
      : command.kind === "request-intent"
        ? event.kind === "request-intent" &&
          (event.role === command.role || event.requestId === command.requestId)
        : command.kind === "response"
          ? event.kind === "response" && event.requestId === command.requestId
          : isExplanationTerminal(event),
  );
  if (match)
    return isDeepStrictEqual(content(match), content(command))
      ? { kind: "existing", event: match, state: explanationState(events) }
      : conflict("The explanation identity was already used with different inputs.");
  if (command.kind === "started") {
    const previous = events.at(-1);
    if (previous && !isExplanationTerminal(previous))
      return conflict(
        "An explanation attempt is already active. Resolve it before starting another.",
      );
    if (events.some((event) => event.attemptId === command.attemptId))
      return conflict("The explanation attempt already exists.");
  } else {
    if (!attempt.length || events.at(-1)?.attemptId !== command.attemptId)
      return conflict("The explanation attempt is not active.");
    if (attempt.some(isExplanationTerminal))
      return conflict("The explanation attempt is already terminal.");
    if (command.kind === "request-intent") {
      if (
        attempt.some((event) => event.kind === "response" && event.exchange.outcome === "ambiguous")
      )
        return conflict("An ambiguous provider outcome requires a deliberate new attempt.");
      if (
        events.some(
          (event) => event.kind === "request-intent" && event.requestId === command.requestId,
        )
      )
        return conflict("The provider request identity is already reserved.");
      if (
        attempt.some(
          (event) =>
            event.kind === "request-intent" &&
            !attempt.some(
              (response) => response.kind === "response" && response.requestId === event.requestId,
            ),
        )
      )
        return conflict("An unresolved provider request must not be replayed.");
      const original = attempt.find(
        (event) => event.kind === "request-intent" && event.role === "original",
      );
      if (command.role === "repair" && !original)
        return conflict("A repair requires the original response.");
    }
    if (command.kind === "response") {
      const reserved = attempt.find(
        (event) => event.kind === "request-intent" && event.requestId === command.requestId,
      );
      if (!reserved || reserved.kind !== "request-intent")
        return conflict("A response requires a reserved request.");
      if (command.exchange.role !== (reserved.role === "original" ? "draft" : "repair"))
        return conflict("The response role does not match its reservation.");
    }
    if (
      command.kind === "completed" &&
      (!attempt.some((event) => event.kind === "response") ||
        attempt.some(
          (event) =>
            event.kind === "request-intent" &&
            !attempt.some(
              (response) => response.kind === "response" && response.requestId === event.requestId,
            ),
        ))
    )
      return conflict("A completed explanation requires durable responses for every request.");
  }
  const event: ExplanationEvent = {
    ...command,
    id: randomUUID(),
    sequence: events.length + 1,
    recordedAt,
  };
  return { kind: "acquired", event, state: explanationState([...events, event]) };
}

export function projectBoardExplanation(board: GameBoard, events: ExplanationEvent[]): GameBoard {
  if (board.request.lifecycleFormat !== "forecast-first-v1") return board;
  const history = events
    .filter((event) => event.boardId === board.id)
    .sort((a, b) => a.sequence - b.sequence);
  const state = explanationState(history);
  const requests = history.flatMap((event) => (event.kind === "response" ? [event.exchange] : []));
  const unaccounted = history.some(
    (event) =>
      event.kind === "request-intent" &&
      !history.some(
        (response) => response.kind === "response" && response.requestId === event.requestId,
      ),
  );
  const sum = (key: "promptTokens" | "completionTokens" | "totalTokens" | "costUsd") =>
    requests.every((request) => request[key] !== null)
      ? requests.reduce((total, request) => total + (request[key] ?? 0), 0)
      : null;
  const costKnown = requests.every((request) => request.costKnown && request.costUsd !== null);
  return {
    ...board,
    explanationState: state,
    explanation: state.kind === "completed" ? state.report : null,
    providerRequests: requests,
    usage: requests.length
      ? {
          promptTokens: sum("promptTokens"),
          completionTokens: sum("completionTokens"),
          totalTokens: sum("totalTokens"),
          costUsd: costKnown && !unaccounted ? sum("costUsd") : null,
          partial:
            unaccounted ||
            !costKnown ||
            requests.some(
              (request) =>
                request.promptTokens === null ||
                request.completionTokens === null ||
                request.totalTokens === null,
            ),
        }
      : null,
    providerOutcomeAmbiguous: state.kind === "ambiguous",
  };
}
