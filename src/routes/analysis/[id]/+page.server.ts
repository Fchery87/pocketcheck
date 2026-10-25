import { error, fail, redirect } from "@sveltejs/kit";
import { americanToDecimal, breakEven } from "#lib/domain/odds.ts";
import { localInputValue, parseObservedAt } from "#lib/server/analysis/form.ts";
import { runAnalysis } from "#lib/server/analysis/run.ts";
import { readSchedule } from "#lib/server/analysis/schedule.ts";
import { ConfigError, now, researchStore, schedulePath } from "#lib/server/config.ts";
import type { Actions, PageServerLoad } from "./$types";

function store() {
  try {
    return researchStore();
  } catch (cause) {
    if (cause instanceof ConfigError) error(503, cause.message);
    throw cause;
  }
}

export const load: PageServerLoad = async ({ params }) => {
  const run = await store().getRun(params.id);
  if (!run) error(404, "Analysis not found");
  const evidenceById = Object.fromEntries(run.evidence.map((item) => [item.id, item]));
  return {
    run,
    decimalOdds: run.offer.decimalOdds,
    decisiveBreakEven: breakEven(run.offer.decimalOdds).decisive,
    claims: (run.report?.claims ?? []).map((claim) => ({
      ...claim,
      evidence: claim.evidenceIds.map((id) => evidenceById[id] ?? null),
    })),
    citations: [...new Set(run.report?.claims.flatMap((claim) => claim.evidenceIds) ?? [])].map(
      (id) => evidenceById[id] ?? { id, missing: true as const },
    ),
    refreshObservedDefault: localInputValue(now()),
  };
};

export const actions = {
  refresh: async ({ params, request }) => {
    const parent = await store().getRun(params.id);
    if (!parent) error(404, "Analysis not found");
    const data = await request.formData();

    const americanOdds = Number(data.get("americanOdds"));
    try {
      americanToDecimal(americanOdds);
    } catch {
      return fail(400, { error: "Enter a valid American price for the refresh" });
    }
    const observedAt = parseObservedAt(String(data.get("observedAt") ?? ""));
    if (!observedAt) return fail(400, { error: "Enter when you observed the new price" });

    const schedule = readSchedule(schedulePath());
    if (!schedule.ok) return fail(503, { error: schedule.reason });
    const game = schedule.games.find((item) => item.id === parent.game.id);
    if (!game)
      return fail(400, { error: `Game ${parent.game.id} is no longer in the schedule file` });

    const sportsbook = String(data.get("sportsbook") ?? "").trim() || parent.offer.sportsbook;
    const result = await runAnalysis(
      {
        game,
        nowIso: now(),
        scheduleRetrievedAt: schedule.retrievedAt,
        sportsbook,
        market: parent.offer.market,
        selection: parent.offer.selection,
        pointLine: parent.offer.pointLine ?? undefined,
        americanOdds,
        observedAt,
        tieRule: parent.offer.rules.tie ?? undefined,
        lean: parent.lean?.text,
        rationale: parent.lean?.rationale,
        parentId: parent.id,
      },
      { store: store() },
    );
    if (result.run) redirect(303, `/analysis/${result.run.id}`);
    return fail(400, { error: result.ok ? "Refresh failed" : result.error });
  },
} satisfies Actions;
