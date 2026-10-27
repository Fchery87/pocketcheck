import { error } from "@sveltejs/kit";
import { ConfigError, researchStore } from "#lib/server/config.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
  let store;
  try {
    store = researchStore();
  } catch (failure) {
    if (failure instanceof ConfigError) error(503, failure.message);
    throw failure;
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const board = uuid.test(params.id) ? await store.getBoard(params.id) : null;
  if (!board) error(404, "Game board not found");
  const parent = board.parentId ? await store.getBoard(board.parentId) : null;
  const refreshes = await store.listRefreshes(board.id);
  return {
    board,
    parent,
    refreshes: refreshes.map((item) => ({
      id: item.id,
      sportsbook: item.sportsbook,
      observedAt: item.observedAt,
    })),
  };
};
