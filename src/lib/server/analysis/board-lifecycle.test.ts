import { createMemoryBoardStore } from "./board-store.ts";
import {
  describeExplanationLifecycle,
  lifecycleInput,
} from "../../../../tests/board-explanation-contract.ts";
import { it, expect } from "vite-plus/test";

describeExplanationLifecycle("memory", createMemoryBoardStore);

it("uses the injected clock for forecast completion and separate explanation history", async () => {
  let time = "2026-10-25T16:00:00.000Z";
  const store = createMemoryBoardStore([], [], { now: () => time });
  const begun = await store.beginBoard(lifecycleInput("clock"));
  if (begun.kind === "conflict") throw new Error(begun.error);
  expect(begun.board.createdAt).toBe(time);
  time = "2026-10-25T16:01:00.000Z";
  const completed = await store.completeBoardForecast({
    boardId: begun.board.id,
    evidence: [],
    gaps: [],
    markets: [{ market: "moneyline", noPickReason: "Unavailable" }],
  });
  expect(completed.completedAt).toBe(time);
  time = "2026-10-25T16:02:00.000Z";
  const attempt = await store.beginBoardExplanation({
    boardId: completed.id,
    attemptId: "clock-attempt",
    drafter: { id: "fixture", modelId: "test" },
  });
  if (attempt.kind === "conflict") throw new Error(attempt.error);
  expect(attempt.event.recordedAt).toBe(time);
  expect((await store.getBoard(completed.id))?.completedAt).toBe(completed.completedAt);
});
