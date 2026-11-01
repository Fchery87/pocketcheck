import { describe, expect, it } from "vite-plus/test";
import { parseGameBoard } from "#lib/domain/board.ts";
import type { GameBoardStore, NewGameBoard } from "#lib/server/analysis/board-store.ts";
import type { ProviderRequestRecord } from "#lib/server/providers/contracts.ts";
import { calculateModelPick } from "#lib/server/analysis/model-pick.ts";

export function lifecycleInput(id: string): NewGameBoard {
  const kickoff = new Date(Date.now() + 86400000).toISOString();
  const cutoff = new Date().toISOString();
  return {
    request: { id, hash: id, lifecycleFormat: "forecast-first-v1" },
    parentId: null,
    game: {
      id: "lifecycle-game",
      season: 2026,
      week: 8,
      home: "PHI",
      away: "DAL",
      kickoff,
      venue: "test",
    },
    sportsbook: "Test",
    observedAt: cutoff,
    cutoffAt: cutoff,
    markets: parseGameBoard({
      gameId: "lifecycle-game",
      kickoffAt: kickoff,
      sportsbook: "Test",
      observedAt: cutoff,
      moneyline: { home: -150, away: 130, tieRule: "push" },
    }),
  };
}
export const exchange: ProviderRequestRecord = {
  requestId: "transport-original",
  role: "draft",
  outcome: "completed",
  response: { text: "saved" },
  promptTokens: 2,
  completionTokens: null,
  totalTokens: null,
  costUsd: null,
  costKnown: false,
};

export function describeExplanationLifecycle(
  name: string,
  makeStore: () => GameBoardStore | Promise<GameBoardStore>,
) {
  describe(`${name} forecast-first lifecycle`, () => {
    it("serializes concurrent primary completions independently of later drafting", async () => {
      const store = await makeStore();
      const input = lifecycleInput("primary-a");
      const market = input.markets[0]!;
      const calculation = calculateModelPick({
        market: "moneyline",
        anchor: market.pricing.anchor,
        sides: [
          {
            offer: market.offers[0],
            probabilities: { win: 0.65, loss: 0.35, push: 0 },
            conservative: null,
          },
          {
            offer: market.offers[1],
            probabilities: { win: 0.35, loss: 0.65, push: 0 },
            conservative: null,
          },
        ],
        released: false,
        materialEvidenceMissing: false,
      });
      const begun = await Promise.all([
        store.beginBoard(input),
        store.beginBoard({
          ...input,
          request: { ...input.request, id: "primary-b", hash: "primary-b" },
        }),
      ]);
      const boards = begun.map((result) => {
        if (result.kind === "conflict") throw new Error(result.error);
        return result.board;
      });
      const completed = await Promise.all(
        boards.map((board) =>
          store.completeBoardForecast({
            boardId: board.id,
            evidence: [],
            gaps: [],
            markets: [
              {
                market: "moneyline",
                pick: {
                  parentPickId: null,
                  calculation,
                  forecast: null,
                  forecastingModel: {
                    checksum: "f".repeat(64),
                    version: 5,
                    trainingCutoff: "2025-01-01T00:00:00Z",
                    releaseStatus: "unreleased",
                    releasedMarkets: [],
                  },
                },
              },
            ],
          }),
        ),
      );
      expect(
        completed
          .flatMap((board) => board.markets)
          .filter((item) => item.pick?.role.role === "primary"),
      ).toHaveLength(1);
      expect(completed.every((board) => board.status === "completed")).toBe(true);
      const primary = completed.find((board) => board.markets[0]?.pick?.role.role === "primary")!;
      await store.beginBoardExplanation({
        boardId: primary.id,
        attemptId: "primary-explanation",
        drafter: { id: "fixture", modelId: "test" },
      });
      await store.finishBoardExplanation({
        boardId: primary.id,
        attemptId: "primary-explanation",
        outcome: { kind: "failed", reasons: ["Contradiction"] },
      });
      expect((await store.getBoard(primary.id))?.markets[0]?.pick?.role.role).toBe("primary");
    });
    it("freezes every market atomically and survives an explanation failure", async () => {
      const store = await makeStore();
      const started = await store.beginBoard(lifecycleInput("complete"));
      if (started.kind === "conflict") throw new Error(started.error);
      const boardId = started.board.id;
      await expect(
        store.completeBoardForecast({ boardId, evidence: [], gaps: [], markets: [] }),
      ).rejects.toThrow("Every board market");
      expect((await store.getBoard(boardId))?.status).toBe("pending");
      const completed = await store.completeBoardForecast({
        boardId,
        evidence: [],
        gaps: ["No inputs"],
        markets: [{ market: "moneyline", noPickReason: "No forecast inputs" }],
      });
      expect(completed.status).toBe("completed");
      await store.beginBoardExplanation({
        boardId,
        attemptId: "attempt",
        drafter: { id: "fixture", modelId: "test" },
      });
      await store.finishBoardExplanation({
        boardId,
        attemptId: "attempt",
        outcome: { kind: "failed", reasons: ["Contradiction"] },
      });
      const read = await store.getBoard(boardId);
      expect(read?.completedAt).toBe(completed.completedAt);
      expect(read?.status).toBe("completed");
      expect(read?.explanationState).toEqual({
        kind: "failed",
        attemptId: "attempt",
        reasons: ["Contradiction"],
      });
      expect(read?.failureReason).toBeNull();
    });
    it("allows one concurrent send per role and exposes reserved-without-response as ambiguous", async () => {
      const store = await makeStore();
      const result = await store.beginBoard(lifecycleInput("reservation"));
      if (result.kind === "conflict") throw new Error(result.error);
      const boardId = result.board.id;
      await store.completeBoardForecast({
        boardId,
        evidence: [],
        gaps: [],
        markets: [{ market: "moneyline", noPickReason: "Unavailable" }],
      });
      const attemptId = "reserve-attempt";
      expect(
        (
          await store.beginBoardExplanation({
            boardId,
            attemptId,
            drafter: { id: "fixture", modelId: "test" },
          })
        ).kind,
      ).toBe("acquired");
      const input = {
        boardId,
        attemptId,
        requestId: "original",
        role: "original" as const,
        bodyHash: "a".repeat(64),
      };
      const reservations = await Promise.all([
        store.reserveBoardExplanationRequest(input),
        store.reserveBoardExplanationRequest(input),
      ]);
      expect(reservations.map((item) => item.kind).sort()).toEqual(["acquired", "existing"]);
      expect((await store.getBoard(boardId))?.explanationState?.kind).toBe("ambiguous");
      expect(
        (await store.reserveBoardExplanationRequest({ ...input, bodyHash: "b".repeat(64) })).kind,
      ).toBe("conflict");
      expect(
        (await store.reserveBoardExplanationRequest({ ...input, requestId: "other" })).kind,
      ).toBe("conflict");
      expect(
        (
          await store.recordBoardExplanationResponse({
            boardId,
            attemptId,
            requestId: "original",
            exchange,
          })
        ).kind,
      ).toBe("acquired");
      expect(
        (
          await store.recordBoardExplanationResponse({
            boardId,
            attemptId,
            requestId: "original",
            exchange,
          })
        ).kind,
      ).toBe("existing");
      expect((await store.getBoard(boardId))?.usage).toMatchObject({
        promptTokens: 2,
        costUsd: null,
        partial: true,
      });
      const repair = { ...input, requestId: "repair", role: "repair" as const };
      expect(
        (
          await Promise.all([
            store.reserveBoardExplanationRequest(repair),
            store.reserveBoardExplanationRequest(repair),
          ])
        )
          .map((item) => item.kind)
          .sort(),
      ).toEqual(["acquired", "existing"]);
      expect(
        (await store.listBoardExplanationEvents(boardId)).map((event) => event.sequence),
      ).toEqual([1, 2, 3, 4]);
    });
  });
}
