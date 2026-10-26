import { fail, redirect } from "@sveltejs/kit";
import { easternTime } from "#lib/format.ts";
import {
  localInputValue,
  parseManualEvidence,
  parseObservedAt,
} from "#lib/server/analysis/form.ts";
import { runAnalysis } from "#lib/server/analysis/run.ts";
import { readSchedule, upcomingGames } from "#lib/server/analysis/schedule.ts";
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

const FIELDS = [
  "gameId",
  "sportsbook",
  "market",
  "selection",
  "pointLine",
  "americanOdds",
  "observedAt",
  "tieRule",
  "lean",
  "rationale",
] as const;

type Values = Partial<Record<(typeof FIELDS)[number], string>>;

function field(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export const load: PageServerLoad = () => {
  const nowIso = now();
  const schedule = readSchedule(schedulePath());
  const games = schedule.ok
    ? upcomingGames(schedule.games, nowIso).map((game) => ({
        id: game.id,
        week: game.week,
        away: game.away,
        home: game.home,
        venue: game.venue.name,
        kickoff: game.kickoff,
        kickoffLabel: easternTime(game.kickoff),
      }))
    : [];
  return {
    games,
    scheduleError: schedule.ok ? null : schedule.reason,
    scheduleRetrievedAt: schedule.ok ? schedule.retrievedAt : null,
    observedDefault: localInputValue(nowIso),
  };
};

export const actions = {
  analyze: async ({ request }) => {
    const data = await request.formData();
    const values: Values = Object.fromEntries(FIELDS.map((name) => [name, field(data, name)]));
    const manual = parseManualEvidence(data);
    // Every failure hands the entered values back so nothing has to be retyped.
    const refuse = (status: number, error: string) =>
      fail(status, { error, values, manual: manual.rows });
    if (!manual.ok) return refuse(400, manual.error);
    const nowIso = now();
    const schedule = readSchedule(schedulePath());
    if (!schedule.ok) return refuse(503, schedule.reason);
    const game = schedule.games.find((item) => item.id === values.gameId);
    if (!game) return refuse(400, "Choose a game");
    if (!upcomingGames([game], nowIso).length) return refuse(400, "The game has already started");
    const observedAt = parseObservedAt(values.observedAt ?? "");
    if (!observedAt) return refuse(400, "Enter when you observed this price");

    let store;
    try {
      store = researchStore();
    } catch (error) {
      if (error instanceof ConfigError) return refuse(503, error.message);
      throw error;
    }
    const drafting = await thesisDrafter();
    if (!drafting.ok) return refuse(503, drafting.error);

    const pointLineRaw = values.pointLine ?? "";
    const result = await runAnalysis(
      {
        game,
        nowIso,
        scheduleRetrievedAt: schedule.retrievedAt,
        sportsbook: values.sportsbook ?? "",
        market: values.market as "moneyline" | "spread" | "total",
        selection: values.selection as "home" | "away" | "over" | "under",
        pointLine: pointLineRaw === "" ? undefined : Number(pointLineRaw),
        americanOdds: Number(values.americanOdds),
        observedAt,
        tieRule: values.tieRule as "push" | "loss" | "win" | "void",
        lean: values.lean,
        rationale: values.rationale,
        manualEvidence: manual.entries,
      },
      { store, drafter: drafting.drafter, collect: evidenceCollector(), model: modelSource() },
    );
    if (!result.ok) {
      if (result.run) redirect(303, `/analysis/${result.run.id}`);
      return refuse(400, result.error);
    }
    redirect(303, `/analysis/${result.run.id}`);
  },
} satisfies Actions;
