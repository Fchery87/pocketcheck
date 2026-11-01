import { error, fail } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { validFinalScores } from "#lib/domain/settlement.ts";
import {
  ConfigError,
  now,
  researchStore,
  schedulePath,
  thesisDrafter,
} from "#lib/server/config.ts";
import { explainBoard } from "#lib/server/analysis/board-explain.ts";
import { readSchedule } from "#lib/server/analysis/schedule.ts";
import { settlementPrefill } from "#lib/server/analysis/settlement-prefill.ts";
import { readDownloadRecord } from "#lib/server/sources/download-record.ts";
import type { SettlementNoticeKind } from "#lib/server/analysis/store.ts";
import type { Actions, PageServerLoad } from "./$types";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kinds = new Set<SettlementNoticeKind>(["final", "postponed", "void", "unresolved"]);

function store() {
  try {
    return researchStore();
  } catch (failure) {
    if (failure instanceof ConfigError) error(503, failure.message);
    throw failure;
  }
}

function resultCandidate(game: { id: string; home: string; away: string; kickoff: string }) {
  const path = schedulePath();
  const schedule = readSchedule(path);
  if (!schedule.ok) return null;
  const { source } = readDownloadRecord(path);
  return settlementPrefill({
    game,
    schedule,
    now: now(),
    source: source ?? `Local schedule ${path}`,
  });
}

export const load: PageServerLoad = async ({ params }) => {
  const journal = store();
  const board = uuid.test(params.id) ? await journal.getBoard(params.id) : null;
  if (!board) error(404, "Game board not found");
  const settlement = await journal.readBoardSettlement(board.id);
  const parent = board.parentId ? await journal.getBoard(board.parentId) : null;
  const refreshes = await journal.listRefreshes(board.id);
  return {
    board,
    explanationAttemptId: randomUUID(),
    settlement,
    resultCandidate: resultCandidate(board.game),
    correctionNotices: [
      ...new Map(
        settlement.markets.flatMap((market) =>
          (market.grade?.history ?? []).map((notice) => [notice.id, notice] as const),
        ),
      ).values(),
    ],
    parent,
    refreshes: refreshes.map((item) => ({
      id: item.id,
      sportsbook: item.sportsbook,
      observedAt: item.observedAt,
    })),
  };
};

export const actions = {
  explain: async ({ request, params }) => {
    const data = await request.formData();
    const attemptId = String(data.get("attemptId") ?? "");
    if (data.get("confirmed") !== "yes" || !uuid.test(attemptId)) {
      return fail(400, {
        explanationError:
          "Confirm that this is a deliberate new explanation request. It may incur provider charges.",
      });
    }
    const journal = store();
    const board = uuid.test(params.id) ? await journal.getBoard(params.id) : null;
    if (!board) error(404, "Game board not found");
    if (board.status !== "completed" || board.request.lifecycleFormat !== "forecast-first-v1") {
      return fail(400, {
        explanationError: "Only a completed forecast-first board can start another explanation.",
      });
    }
    const selected = await thesisDrafter();
    if (!selected.ok) return fail(400, { explanationError: selected.error });
    const outcome = await explainBoard(journal, board, selected.drafter, {
      newAttempt: true,
      attemptId,
    });
    if (!outcome.ok) return fail(400, { explanationError: outcome.error });
    return { explanationRecorded: true };
  },
  confirmResult: async ({ request, params }) => {
    const data = await request.formData();
    const journal = store();
    const board = uuid.test(params.id) ? await journal.getBoard(params.id) : null;
    if (!board) error(404, "Game board not found");
    const candidate = resultCandidate(board.game);
    if (
      !candidate ||
      data.get("identity") !== candidate.identity ||
      data.get("confirmed") !== "yes"
    ) {
      return fail(400, {
        settled: false,
        error: "Review the current sourced result and explicitly confirm it before recording.",
      });
    }
    try {
      const result = await journal.recordGameSettlement({
        eventId: `schedule-result-${candidate.identity}`,
        gameId: board.game.id,
        kind: "final",
        homeScore: candidate.homeScore,
        awayScore: candidate.awayScore,
        recordedAt: now(),
        source: `${candidate.source}, retrieved ${candidate.retrievedAt}`,
      });
      if (result.kind === "conflict") return fail(409, { settled: false, error: result.error });
      return { settled: true, duplicate: result.kind === "duplicate", error: null };
    } catch (cause) {
      return fail(400, {
        settled: false,
        error: cause instanceof Error ? cause.message : "Settlement was not saved",
      });
    }
  },
  settle: async ({ request, params }) => {
    const data = await request.formData();
    const eventId = String(data.get("eventId") ?? "").trim();
    const kind = String(data.get("kind") ?? "").trim();
    const homeText = String(data.get("homeScore") ?? "").trim();
    const awayText = String(data.get("awayScore") ?? "").trim();
    const reason = String(data.get("reason") ?? "").trim();
    const correctsNoticeId = String(data.get("correctsNoticeId") ?? "").trim();
    if (!eventId)
      return fail(400, { settled: false, error: "Enter a settlement event identifier" });
    if (!kinds.has(kind as SettlementNoticeKind)) {
      return fail(400, { settled: false, error: "Choose a settlement kind" });
    }
    const homeScore = homeText === "" ? null : Number(homeText);
    const awayScore = awayText === "" ? null : Number(awayText);
    if (kind === "final" && !validFinalScores(homeScore, awayScore)) {
      return fail(400, {
        settled: false,
        error: "A final result needs nonnegative whole-number scores",
      });
    }
    const journal = store();
    const board = uuid.test(params.id) ? await journal.getBoard(params.id) : null;
    if (!board) error(404, "Game board not found");
    try {
      const result = await journal.recordGameSettlement({
        eventId,
        gameId: board.game.id,
        kind: kind as SettlementNoticeKind,
        homeScore,
        awayScore,
        recordedAt: now(),
        source: "game board",
        reason: reason || null,
        correctsNoticeId: correctsNoticeId || null,
      });
      if (result.kind === "conflict") return fail(409, { settled: false, error: result.error });
      return { settled: true, duplicate: result.kind === "duplicate", error: null };
    } catch (cause) {
      return fail(400, {
        settled: false,
        error: cause instanceof Error ? cause.message : "Settlement was not saved",
      });
    }
  },
  withdraw: async ({ request, params }) => {
    const reason = String((await request.formData()).get("reason") ?? "").trim();
    if (!reason)
      return fail(400, { withdrawn: false, withdrawError: "Say why this board is withdrawn." });
    const journal = store();
    const board = uuid.test(params.id) ? await journal.getBoard(params.id) : null;
    if (!board) error(404, "Game board not found");
    try {
      await journal.withdrawBoard({ boardId: board.id, reason });
      return { withdrawn: true };
    } catch (cause) {
      return fail(400, {
        withdrawn: false,
        withdrawError: cause instanceof Error ? cause.message : "The board was not withdrawn",
      });
    }
  },
} satisfies Actions;
