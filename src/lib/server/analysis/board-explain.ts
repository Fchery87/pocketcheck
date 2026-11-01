import { createHash, randomUUID } from "node:crypto";
import type { GameBoardOutcome } from "./board-run.ts";
import type { GameBoard, GameBoardStore } from "./board-store.ts";
import type { PickDrafter } from "../providers/contracts.ts";
import {
  buildPickExplanationPacket,
  renderPickExplanation,
  validatePickExplanation,
} from "./pick-explanation.ts";
import { redactText } from "./redact.ts";

export async function explainBoard(
  store: GameBoardStore,
  board: GameBoard,
  drafter: PickDrafter,
  options: { newAttempt?: boolean; attemptId?: string } = {},
): Promise<GameBoardOutcome> {
  const packet = buildPickExplanationPacket({
    game: board.game,
    markets: board.markets,
    evidence: board.evidence,
    gaps: board.gaps,
  });
  if (!packet.picks.length) return { ok: true as const, board };
  board = (await store.getBoard(board.id))!;
  if (
    board.drafter &&
    (board.drafter.id !== drafter.id || board.drafter.modelId !== drafter.modelId)
  )
    return {
      ok: false,
      error: "Restore this board's original drafter and model before explaining its frozen picks.",
      board,
    };
  const prior = await store.listBoardExplanationEvents(board.id);
  let attemptId = prior.at(-1)?.attemptId ?? `${board.id}:explanation:1`;
  const requestedAttempt = options.attemptId
    ? `${board.id}:explanation:${options.attemptId}`
    : null;
  const existingSubmission =
    requestedAttempt && prior.some((event) => event.attemptId === requestedAttempt);
  if (options.newAttempt && !existingSubmission) {
    const state = board.explanationState;
    if (state?.kind === "pending" || state?.kind === "ambiguous") {
      const terminal = prior.some(
        (event) =>
          event.attemptId === attemptId &&
          ["completed", "failed", "ambiguous"].includes(event.kind),
      );
      if (!terminal) {
        const resolved = await store.finishBoardExplanation({
          boardId: board.id,
          attemptId,
          outcome: {
            kind: "ambiguous",
            reason:
              "The user deliberately started a new explanation attempt. The earlier request outcome remains unresolved.",
          },
        });
        if (resolved.kind === "conflict") return { ok: false, error: resolved.error, board };
      }
    }
    attemptId = requestedAttempt ?? `${board.id}:explanation:${randomUUID()}`;
  } else {
    if (existingSubmission && requestedAttempt !== attemptId)
      return {
        ok: false,
        error:
          "This explanation submission already belongs to an earlier attempt and was not replayed.",
        board,
      };
    if (board.explanationState?.kind === "completed") return { ok: true, board };
    if (board.explanationState?.kind === "failed")
      return { ok: false, error: board.explanationState.reasons.join("; "), board };
    if (board.explanationState?.kind === "ambiguous")
      return {
        ok: false,
        error:
          "The earlier provider outcome is ambiguous. Deliberately start a new explanation attempt to retry.",
        board,
      };
  }
  const started = await store.beginBoardExplanation({
    boardId: board.id,
    attemptId,
    drafter: { id: drafter.id, modelId: drafter.modelId },
  });
  if (started.kind === "conflict") return { ok: false as const, error: started.error, board };
  const current = (await store.getBoard(board.id))!;
  if (current.explanationState?.kind === "completed") return { ok: true as const, board: current };
  if (current.explanationState?.kind === "failed")
    return {
      ok: false as const,
      error: current.explanationState.reasons.join("; "),
      board: current,
    };
  if (started.kind === "existing") {
    const events = await store.listBoardExplanationEvents(board.id);
    if (!events.some((event) => event.kind === "response" && event.attemptId === attemptId))
      return {
        ok: false as const,
        error:
          "This explanation is already active or has no durable response. It was not replayed.",
        board: current,
      };
  }
  try {
    const history = await store.listBoardExplanationEvents(board.id);
    const attempt = history.filter((event) => event.attemptId === attemptId);
    const response = attempt.filter((event) => event.kind === "response").at(-1);
    const unresolved = attempt.some(
      (event) =>
        event.kind === "request-intent" &&
        !attempt.some((saved) => saved.kind === "response" && saved.requestId === event.requestId),
    );
    if (!unresolved && response?.kind === "response" && response.exchange.outcome === "completed") {
      let report: unknown = response.exchange.response;
      if (typeof report === "string") {
        try {
          report = JSON.parse(report);
        } catch {
          report = null;
        }
      }
      const recovered = validatePickExplanation(report, packet);
      if (recovered.ok) {
        const finished = await store.finishBoardExplanation({
          boardId: board.id,
          attemptId,
          outcome: { kind: "completed", report: renderPickExplanation(recovered.report, packet) },
        });
        if (finished.kind === "conflict")
          return { ok: false, error: finished.error, board: (await store.getBoard(board.id))! };
        return { ok: true, board: (await store.getBoard(board.id))! };
      }
    }
    const drafted = await drafter.draftPickExplanation({
      modelId: drafter.modelId,
      catalog: [],
      packet,
      beforeRequest: async ({ role, body }) => {
        const requestId = `${attemptId}:${role}`;
        const reserved = await store.reserveBoardExplanationRequest({
          boardId: board.id,
          attemptId,
          requestId,
          role: role === "draft" ? "original" : "repair",
          bodyHash: createHash("sha256").update(body).digest("hex"),
        });
        if (reserved.kind === "conflict") throw new Error(reserved.error);
        if (reserved.kind === "existing") {
          const events = await store.listBoardExplanationEvents(board.id);
          const response = events.find(
            (event) => event.kind === "response" && event.requestId === requestId,
          );
          if (response?.kind === "response") return { response: response.exchange };
          throw new Error(
            "A reserved provider request has no durable response. Start a deliberate new attempt before another provider request.",
          );
        }
      },
      afterResponse: async (exchange) => {
        const saved = await store.recordBoardExplanationResponse({
          boardId: board.id,
          attemptId,
          requestId: `${attemptId}:${exchange.role}`,
          exchange,
        });
        if (saved.kind === "conflict") throw new Error(saved.error);
      },
    });
    const exchanges = (await store.listBoardExplanationEvents(board.id)).filter(
      (event) => event.attemptId === attemptId,
    );
    if (!exchanges.some((event) => event.kind === "response" && event.attemptId === attemptId))
      throw new Error("The drafter did not persist a provider response through its request hooks.");
    if (
      exchanges.some((event) => event.kind === "response" && event.exchange.outcome === "ambiguous")
    ) {
      const reason =
        "Provider completion is ambiguous. Start a deliberate new attempt before another provider request.";
      await store.finishBoardExplanation({
        boardId: board.id,
        attemptId,
        outcome: { kind: "ambiguous", reason },
      });
      return { ok: false as const, error: reason, board: (await store.getBoard(board.id))! };
    }
    const checked = validatePickExplanation(drafted.report, packet);
    const outcome =
      !drafted.draftingFailed && checked.ok
        ? { kind: "completed" as const, report: renderPickExplanation(checked.report, packet) }
        : {
            kind: "failed" as const,
            reasons: drafted.error?.message
              ? [redactText(drafted.error.message)]
              : checked.ok
                ? ["The drafter returned no explanation."]
                : checked.reasons,
          };
    const finished = await store.finishBoardExplanation({ boardId: board.id, attemptId, outcome });
    if (finished.kind === "conflict") throw new Error(finished.error);
    const saved = (await store.getBoard(board.id))!;
    return outcome.kind === "completed"
      ? { ok: true as const, board: saved }
      : { ok: false as const, error: outcome.reasons.join("; "), board: saved };
  } catch (error) {
    const reason = redactText(error instanceof Error ? error.message : String(error));
    // A durable response is recoverable, while an unresolved reservation must never be resent.
    const events = (await store.listBoardExplanationEvents(board.id)).filter(
      (event) => event.attemptId === attemptId,
    );
    const unresolved = events.some(
      (event) =>
        event.kind === "request-intent" &&
        !events.some(
          (response) => response.kind === "response" && response.requestId === event.requestId,
        ),
    );
    const response = events.some((event) => event.kind === "response");
    if (started.kind === "acquired" && !response && !unresolved)
      await store.finishBoardExplanation({
        boardId: board.id,
        attemptId,
        outcome: { kind: "failed", reasons: [reason] },
      });
    return { ok: false as const, error: reason, board: (await store.getBoard(board.id))! };
  }
}
