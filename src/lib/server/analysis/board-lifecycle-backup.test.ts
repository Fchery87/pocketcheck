import { describe, expect, it } from "vite-plus/test";
import { createMemoryBoardStore } from "./board-store.ts";
import { decodeJournalBackup, type JournalExport } from "./journal-backup.ts";
import { lifecycleInput, exchange } from "../../../../tests/board-explanation-contract.ts";

async function fixture() {
  const store = createMemoryBoardStore();
  const begun = await store.beginBoard(lifecycleInput("backup"));
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
    attemptId: "backup-attempt",
    drafter: { id: "fixture", modelId: "test" },
  });
  await store.reserveBoardExplanationRequest({
    boardId,
    attemptId: "backup-attempt",
    requestId: "original",
    role: "original",
    bodyHash: "a".repeat(64),
  });
  await store.recordBoardExplanationResponse({
    boardId,
    attemptId: "backup-attempt",
    requestId: "original",
    exchange,
  });
  return {
    version: 1,
    games: [],
    offers: [],
    evidence: [],
    analyses: [],
    reports: [],
    userResearch: [],
    bets: [],
    settlements: [],
    closings: [],
    gameBoards: [...store.boards.values()],
    explanationEvents: [...store.explanationEvents.values()],
  } satisfies JournalExport;
}
describe("explanation backup graph", () => {
  it("preserves response history and permits old files with no events", async () => {
    const backup = await fixture();
    expect(decodeJournalBackup(backup).explanationEvents).toEqual(backup.explanationEvents);
    expect(
      decodeJournalBackup({ ...backup, explanationEvents: undefined }).explanationEvents,
    ).toEqual([]);
  });
  it("rejects response accounting omitted from a durable exchange", async () => {
    const backup = await fixture();
    const response = backup.explanationEvents.find((event) => event.kind === "response")!;
    if (response.kind !== "response") throw new Error("Missing response");
    // @ts-expect-error A malformed backup is deliberately missing accounting.
    delete response.exchange.costKnown;
    expect(() => decodeJournalBackup(backup)).toThrow(/response|accounting/);
  });
  it("rejects reordered sequence, missing intent, duplicate identifiers and backward chronology", async () => {
    const backup = await fixture();
    for (const change of [
      (copy: JournalExport) => {
        copy.explanationEvents![1]!.sequence = 9;
      },
      (copy: JournalExport) => {
        copy.explanationEvents!.splice(1, 1);
      },
      (copy: JournalExport) => {
        copy.explanationEvents![1]!.id = copy.explanationEvents![0]!.id;
      },
      (copy: JournalExport) => {
        copy.explanationEvents![1]!.recordedAt = "2000-01-01T00:00:00Z";
      },
    ]) {
      const copy = structuredClone(backup);
      change(copy);
      expect(() => decodeJournalBackup(copy)).toThrow(/explanation|Explanation/);
    }
  });
});
