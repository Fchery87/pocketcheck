import { error, fail } from "@sveltejs/kit";
import { ConfigError, now, researchStore } from "#lib/server/config.ts";
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

export const load: PageServerLoad = async ({ params }) => {
  const journal = store();
  const board = uuid.test(params.id) ? await journal.getBoard(params.id) : null;
  if (!board) error(404, "Game board not found");
  const settlement = await journal.readBoardSettlement(board.id);
  const parent = board.parentId ? await journal.getBoard(board.parentId) : null;
  const refreshes = await journal.listRefreshes(board.id);
  return {
    board,
    settlement,
    parent,
    refreshes: refreshes.map((item) => ({
      id: item.id,
      sportsbook: item.sportsbook,
      observedAt: item.observedAt,
    })),
  };
};

export const actions = {
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
    if (kind === "final" && (!Number.isInteger(homeScore) || !Number.isInteger(awayScore))) {
      return fail(400, { settled: false, error: "A final result needs whole-number scores" });
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
