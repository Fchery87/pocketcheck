import { error, redirect } from "@sveltejs/kit";
import { loadFixtureGames } from "#lib/server/analysis/games.ts";
import { researchJournal } from "#lib/server/analysis/memory-journal.ts";
import { runAnalysis } from "#lib/server/analysis/run.ts";
import { resolve } from "node:path";
import type { Actions, PageServerLoad } from "./$types";

const FIXTURE_NOW = "2026-10-25T16:00:00.000Z";

export const load: PageServerLoad = ({ params }) => {
  const run = researchJournal.get(params.id);
  if (!run) error(404, "Analysis not found");
  const citations = run.report?.claims.flatMap((claim) => claim.evidenceIds) ?? [];
  return {
    id: run.id,
    status: run.status,
    stages: run.stages,
    report: run.report,
    citations,
    lean: run.lean,
    failureReason: run.failureReason,
    gameId: run.game.id,
    sportsbook: run.offer.sportsbook,
    market: run.offer.market,
    selection: run.offer.selection,
    americanOdds: run.offer.americanOdds,
    observedAt: run.offer.observedAt,
    tieRule: run.offer.rules.tie,
    renderedText: run.renderedText,
    policy: run.policy,
  };
};

export const actions = {
  refresh: async ({ params, request }) => {
    const parent = researchJournal.get(params.id);
    if (!parent) error(404, "Analysis not found");
    const data = await request.formData();
    const games = loadFixtureGames(
      resolve("tests/fixtures/sources/games-minimized.csv"),
      FIXTURE_NOW,
    );
    const game = games.find((item) => item.id === parent.game.id) ?? parent.game;
    const pointLine = parent.offer.pointLine;
    const postedOdds = Number(data.get("americanOdds"));
    const result = await runAnalysis({
      game,
      nowIso: FIXTURE_NOW,
      sportsbook: String(data.get("sportsbook") ?? parent.offer.sportsbook),
      market: parent.offer.market,
      selection: parent.offer.selection,
      pointLine: pointLine === null ? undefined : pointLine,
      americanOdds: Number.isFinite(postedOdds) ? postedOdds : parent.offer.americanOdds,
      observedAt: parent.offer.observedAt,
      tieRule: parent.offer.rules.tie ?? undefined,
      lean: parent.lean?.text,
      rationale: parent.lean?.rationale,
      parentId: parent.id,
    });
    if (!result.ok || !result.run) {
      return { error: result.ok ? "Refresh failed" : result.error };
    }
    redirect(303, `/analysis/${result.run.id}`);
  },
} satisfies Actions;
