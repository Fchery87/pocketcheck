import { expect, it } from "vite-plus/test";
import { createMemoryBoardStore } from "./board-store.ts";
import { exchange, lifecycleInput } from "../../../../tests/board-explanation-contract.ts";

it("projects every board return without copying explanation history into raw storage", async () => {
  const store = createMemoryBoardStore();
  const input = lifecycleInput("projection");
  const begun = await store.beginBoard(input);
  if (begun.kind === "conflict") throw new Error(begun.error);
  const boardId = begun.board.id;
  expect(begun.board).toEqual(await store.getBoard(boardId));
  const forecast = {
    boardId,
    evidence: [],
    gaps: [],
    markets: [{ market: "moneyline" as const, noPickReason: "Unavailable" }],
  };
  const completed = await store.completeBoardForecast(forecast);
  expect(completed).toEqual(await store.getBoard(boardId));
  const raw = structuredClone(store.boards.get(boardId));
  await store.beginBoardExplanation({
    boardId,
    attemptId: "attempt",
    drafter: { id: "test", modelId: "test" },
  });
  await store.reserveBoardExplanationRequest({
    boardId,
    attemptId: "attempt",
    requestId: "request",
    role: "original",
    bodyHash: "a".repeat(64),
  });
  await store.recordBoardExplanationResponse({
    boardId,
    attemptId: "attempt",
    requestId: "request",
    exchange,
  });
  const projected = await store.getBoard(boardId);
  expect(projected!.providerRequests).toEqual([exchange]);
  expect(store.boards.get(boardId)).toEqual(raw);
  expect(await store.beginBoard(input)).toEqual({ kind: "existing", board: projected });
  expect(await store.completeBoardForecast(forecast)).toEqual(projected);
  expect(await store.finishBoard({ boardId, status: "failed", failureReason: "late" })).toEqual(
    projected,
  );
  const withdrawn = await store.withdrawBoard({ boardId, reason: "test" });
  expect(withdrawn).toEqual(await store.getBoard(boardId));
  expect(await store.withdrawBoard({ boardId, reason: "ignored" })).toEqual(withdrawn);
  expect(store.boards.get(boardId)).toEqual({ ...raw, withdrawal: withdrawn.withdrawal });
  withdrawn.providerRequests.length = 0;
  expect((await store.getBoard(boardId))!.providerRequests).toEqual([exchange]);
});
