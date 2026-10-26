import { error, fail } from "@sveltejs/kit";
import { parseOffer, type Market, type OfferRules, type SideSelection, type TieRule } from "#lib/domain/offer.ts";
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

const markets = new Set<Market>(["moneyline", "spread", "total"]);
const selections = new Set<SideSelection>(["home", "away", "over", "under"]);
const ties = new Set<TieRule>(["push", "loss", "win", "void"]);

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    const analysisId = String(data.get("analysisId") ?? "").trim();
    const sportsbook = String(data.get("sportsbook") ?? "").trim();
    const market = String(data.get("market") ?? "").trim();
    const selection = String(data.get("selection") ?? "").trim();
    const pointLineText = String(data.get("pointLine") ?? "").trim();
    const americanOdds = Number(data.get("americanOdds"));
    const stakeUnits = Number(data.get("stakeUnits"));
    const tie = String(data.get("tie") ?? "").trim();
    const submissionId = String(data.get("submissionId") ?? "").trim();
    if (!analysisId)
      return fail(400, { recorded: false, error: "Choose the analysis this bet belongs to" });
    if (!submissionId) {
      return fail(400, { recorded: false, error: "Enter a submission identifier for this placement" });
    }
    if (!markets.has(market as Market)) {
      return fail(400, { recorded: false, error: "Choose the market you placed" });
    }
    if (!selections.has(selection as SideSelection)) {
      return fail(400, { recorded: false, error: "Choose the selection you placed" });
    }
    const pointLine = pointLineText === "" ? undefined : Number(pointLineText);
    if (pointLine !== undefined && !Number.isFinite(pointLine)) {
      return fail(400, { recorded: false, error: "Enter the line you placed" });
    }
    if (market === "moneyline" && !ties.has(tie as TieRule)) {
      return fail(400, { recorded: false, error: "A moneyline requires a tie rule" });
    }
    if (!Number.isFinite(stakeUnits) || stakeUnits <= 0) {
      return fail(400, { recorded: false, error: "Stake must be a positive number of units" });
    }
    const journal = store();
    const analysis = await journal.getRun(analysisId);
    if (!analysis) return fail(400, { recorded: false, error: `Analysis not found: ${analysisId}` });
    const rules: OfferRules = {
      period: "full-game",
      overtime: "included",
      ...(market === "moneyline" ? { tie: tie as TieRule } : {}),
    };
    try {
      parseOffer({
        gameId: analysis.game.id,
        sportsbook,
        market: market as Market,
        selection: selection as SideSelection,
        pointLine,
        americanOdds,
        observedAt: now(),
        kickoffAt: analysis.game.kickoff,
        rules,
      });
    } catch (cause) {
      return fail(400, {
        recorded: false,
        error: cause instanceof Error ? cause.message : "The placed contract is not valid",
      });
    }
    try {
      const result = await journal.recordBet({
        analysisId,
        submissionId,
        sportsbook,
        market: market as Market,
        selection: selection as SideSelection,
        pointLine,
        rules,
        americanOdds,
        stakeUnits,
        placedAt: now(),
      });
      if (result.kind === "conflict") return fail(409, { recorded: false, error: result.error });
    } catch (cause) {
      return fail(400, {
        recorded: false,
        error: cause instanceof Error ? cause.message : "Bet was not saved",
      });
    }
    return { recorded: true, error: null };
  },
} satisfies Actions;
