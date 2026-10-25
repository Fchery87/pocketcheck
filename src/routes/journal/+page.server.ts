import { fail } from "@sveltejs/kit";
import { researchJournal } from "#lib/server/analysis/memory-journal.ts";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = () => {
  return {
    assessments: researchJournal.listCompleted().map((run) => ({
      id: run.id,
      conclusion: run.report?.conclusion ?? "unknown",
      away: run.game.away,
      home: run.game.home,
      americanOdds: run.offer.americanOdds,
    })),
    bets: researchJournal.listBets(),
  };
};

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    const sportsbook = String(data.get("sportsbook") ?? "").trim();
    const americanOdds = Number(data.get("americanOdds"));
    const stakeUnits = Number(data.get("stakeUnits"));
    if (!sportsbook || !Number.isFinite(americanOdds) || !Number.isFinite(stakeUnits)) {
      return fail(400, { recorded: false });
    }
    const analysisId = String(data.get("analysisId") ?? "");
    researchJournal.recordBet({
      analysisId: analysisId || null,
      sportsbook,
      americanOdds,
      stakeUnits,
      placedAt: new Date().toISOString(),
    });
    return { recorded: true };
  },
} satisfies Actions;
