import { error, fail } from "@sveltejs/kit";
import { americanToDecimal } from "#lib/domain/odds.ts";
import { ConfigError, now, researchStore } from "#lib/server/config.ts";
import type { Actions, PageServerLoad } from "./$types";

function store() {
  try {
    return researchStore();
  } catch (cause) {
    if (cause instanceof ConfigError) error(503, cause.message);
    throw cause;
  }
}

export const load: PageServerLoad = async () => {
  const journal = store();
  const [assessments, bets] = await Promise.all([journal.listCompleted(), journal.listBets()]);
  return { assessments, bets };
};

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    const analysisId = String(data.get("analysisId") ?? "").trim();
    const sportsbook = String(data.get("sportsbook") ?? "").trim();
    const americanOdds = Number(data.get("americanOdds"));
    const stakeUnits = Number(data.get("stakeUnits"));
    if (!analysisId)
      return fail(400, { recorded: false, error: "Choose the analysis this bet belongs to" });
    if (!sportsbook) return fail(400, { recorded: false, error: "Enter the sportsbook" });
    try {
      americanToDecimal(americanOdds);
    } catch {
      return fail(400, { recorded: false, error: "Enter a valid American price" });
    }
    if (!Number.isFinite(stakeUnits) || stakeUnits <= 0) {
      return fail(400, { recorded: false, error: "Stake must be a positive number of units" });
    }
    try {
      await store().recordBet({
        analysisId,
        sportsbook,
        americanOdds,
        stakeUnits,
        placedAt: now(),
      });
    } catch (cause) {
      return fail(400, {
        recorded: false,
        error: cause instanceof Error ? cause.message : "Bet was not saved",
      });
    }
    return { recorded: true, error: null };
  },
} satisfies Actions;
