import { error, fail, redirect } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { breakEven } from "#lib/domain/odds.ts";
import { localInputValue, parseRefreshContract } from "#lib/server/analysis/form.ts";
import { forDisplay } from "#lib/server/analysis/model.ts";
import { runAnalysis } from "#lib/server/analysis/run.ts";
import { readSchedule } from "#lib/server/analysis/schedule.ts";
import {
  ConfigError,
  evidenceCollector,
  modelSource,
  now,
  researchStore,
  schedulePath,
  thesisDrafter,
} from "#lib/server/config.ts";
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
    // Recorded but ineligible model probabilities are not sent to the browser at all.
    run: { ...run, probabilityModel: forDisplay(run.probabilityModel) },
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
    refreshRequestId: randomUUID(),
    refreshCutoffAt: now(),
    refreshScheduleRetrievedAt: (() => {
      const schedule = readSchedule(schedulePath());
      return schedule.ok ? schedule.retrievedAt : "";
    })(),
  };
};

export const actions = {
  refresh: async ({ params, request }) => {
    const parent = await store().getRun(params.id);
    if (!parent) error(404, "Analysis not found");
    const data = await request.formData();
    const field = (name: string) => String(data.get(name) ?? "");
    const values = {
      requestId: field("requestId") || randomUUID(),
      cutoffAt: field("cutoffAt"),
      scheduleRetrievedAt: field("scheduleRetrievedAt"),
      sportsbook: field("sportsbook").trim() || parent.offer.sportsbook,
      pointLine: field("pointLine"),
      americanOdds: field("americanOdds"),
      observedAt: field("observedAt"),
      market: field("market") || parent.offer.market,
      selection: field("selection") || parent.offer.selection,
    };
    const refuse = (status: number, message: string) => fail(status, { error: message, values });
    const parsed = parseRefreshContract(values, {
      market: parent.offer.market,
      selection: parent.offer.selection,
      pointLine: parent.offer.pointLine,
      sportsbook: parent.offer.sportsbook,
      americanOdds: parent.offer.americanOdds,
      tieRule: parent.offer.rules.tie,
    });
    if (!parsed.ok) return refuse(400, parsed.error);

    const schedule = readSchedule(schedulePath());
    if (!schedule.ok) return refuse(503, schedule.reason);
    const game = schedule.games.find((item) => item.id === parent.game.id);
    if (!game) return refuse(400, `Game ${parent.game.id} is no longer in the schedule file`);

    const drafting = await thesisDrafter();
    if (!drafting.ok) return refuse(503, drafting.error);

    const result = await runAnalysis(
      {
        game,
        requestId: values.requestId,
        nowIso: validCutoff(values.cutoffAt) ?? now(),
        scheduleRetrievedAt: values.scheduleRetrievedAt || schedule.retrievedAt,
        sportsbook: parsed.contract.sportsbook,
        market: parsed.contract.market,
        selection: parsed.contract.selection,
        pointLine: parsed.contract.pointLine,
        americanOdds: parsed.contract.americanOdds,
        observedAt: parsed.contract.observedAt,
        tieRule: parsed.contract.tieRule,
        lean: parent.lean?.text,
        rationale: parent.lean?.rationale,
        parentId: parent.id,
        carriedEvidence: parent.evidence.filter((item) => item.origin === "manual"),
      },
      {
        store: store(),
        drafter: drafting.drafter,
        collect: evidenceCollector(),
        model: modelSource(),
      },
    );
    if (result.run) redirect(303, `/analysis/${result.run.id}`);
    return refuse(400, result.ok ? "Refresh failed" : result.error);
  },
} satisfies Actions;

function validCutoff(value: string): string | null {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
