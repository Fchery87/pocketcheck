import { afterEach, it, expect } from "vite-plus/test";
import { createNeonBoardStore } from "#lib/server/analysis/neon-board-store.ts";
import { describeExplanationLifecycle } from "../board-explanation-contract.ts";
import { lifecycleInput } from "../board-explanation-contract.ts";
import { isolatedDb, type IsolatedDb } from "./isolated-db.ts";
const open: IsolatedDb[] = [];
describeExplanationLifecycle("PostgreSQL", async () => {
  const isolated = await isolatedDb({ connections: 4 });
  open.push(isolated);
  return createNeonBoardStore(isolated.db);
});
afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.drop()));
});

it("protects explanation events and rolls back conflicting event restore", async () => {
  const isolated = await isolatedDb();
  open.push(isolated);
  const store = createNeonBoardStore(isolated.db);
  const begun = await store.beginBoard(lifecycleInput("append-only"));
  if (begun.kind === "conflict") throw new Error(begun.error);
  const boardId = begun.board.id;
  await store.completeBoardForecast({
    boardId,
    evidence: [],
    gaps: [],
    markets: [{ market: "moneyline", noPickReason: "Unavailable" }],
  });
  await store.beginBoardExplanation({
    boardId,
    attemptId: "append-only",
    drafter: { id: "fixture", modelId: "test" },
  });
  const events = await store.readExplanationEvents(isolated.db);
  await expect(
    isolated.db`UPDATE board_explanation_events SET kind = 'failed' WHERE id = ${events[0]!.id}`,
  ).rejects.toThrow("append-only");
  await expect(
    isolated.db`DELETE FROM board_explanation_events WHERE id = ${events[0]!.id}`,
  ).rejects.toThrow("append-only");
  await expect(
    isolated.db`UPDATE game_boards SET failure_reason = 'overwrite' WHERE id = ${boardId}`,
  ).rejects.toThrow();
  await expect(
    isolated.db.begin(async (tx) => {
      await store.restoreExplanationEvents(tx, [
        {
          ...events[0]!,
          id: "66666666-6666-4666-8666-666666666666",
          sequence: 2,
          attemptId: "different",
        },
        { ...events[0]!, attemptId: "conflicting" },
      ]);
    }),
  ).rejects.toThrow("Conflicting explanation");
  expect(await store.readExplanationEvents(isolated.db)).toEqual(events);
});
