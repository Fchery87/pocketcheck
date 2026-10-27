import { fail, redirect } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { easternTime } from "#lib/format.ts";
import {
  localInputValue,
  parseManualEvidence,
  parseObservedAt,
} from "#lib/server/analysis/form.ts";
import type { TieRule } from "#lib/domain/offer.ts";
import { runGameBoard } from "#lib/server/analysis/board-run.ts";
import { readSchedule, upcomingGames } from "#lib/server/analysis/schedule.ts";
import {
  ConfigError,
  evidenceCollector,
  forecastSource,
  modelSource,
  now,
  researchStore,
  schedulePath,
} from "#lib/server/config.ts";
import type { Actions, PageServerLoad } from "./$types";

const FIELDS = [
  "gameId",
  "sportsbook",
  "observedAt",
  "moneylineHome",
  "moneylineAway",
  "tieRule",
  "lean",
  "rationale",
  "requestId",
  "cutoffAt",
  "scheduleRetrievedAt",
] as const;

type Values = Partial<Record<(typeof FIELDS)[number], string>>;

const TIE_RULES: readonly TieRule[] = ["push", "loss", "win", "void"];

function field(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Blank stays unentered. Anything else must be a whole American price. */
function odds(raw: string): { ok: true; value: number | undefined } | { ok: false; error: string } {
  if (raw === "") return { ok: true, value: undefined };
  const value = Number(raw.replace("−", "-"));
  if (!Number.isInteger(value)) return { ok: false, error: `Invalid American price: ${raw}` };
  return { ok: true, value };
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
        kickoffLabel: easternTime(game.kickoff),
      }))
    : [];
  return {
    games,
    scheduleError: schedule.ok ? null : schedule.reason,
    scheduleRetrievedAt: schedule.ok ? schedule.retrievedAt : null,
    observedDefault: localInputValue(nowIso),
    requestId: randomUUID(),
    cutoffAt: nowIso,
  };
};

export const actions = {
  freeze: async ({ request }) => {
    const data = await request.formData();
    const values: Values = Object.fromEntries(FIELDS.map((name) => [name, field(data, name)]));
    const manual = parseManualEvidence(data);
    // Every failure hands the entered values back so nothing has to be retyped.
    const refuse = (status: number, error: string) =>
      fail(status, { error, values, manual: manual.rows });
    if (!manual.ok) return refuse(400, manual.error);
    const cutoffAt = values.cutoffAt ?? "";
    const nowIso = Number.isFinite(Date.parse(cutoffAt)) ? new Date(cutoffAt).toISOString() : now();
    const schedule = readSchedule(schedulePath());
    if (!schedule.ok) return refuse(503, schedule.reason);
    const game = schedule.games.find((item) => item.id === values.gameId);
    if (!game) return refuse(400, "Choose a game");
    if (!upcomingGames([game], nowIso).length) return refuse(400, "The game has already started");
    const observedAt = parseObservedAt(values.observedAt ?? "");
    if (!observedAt) return refuse(400, "Enter when you observed these prices");
    const home = odds(values.moneylineHome ?? "");
    if (!home.ok) return refuse(400, home.error);
    const away = odds(values.moneylineAway ?? "");
    if (!away.ok) return refuse(400, away.error);
    const tieRule = values.tieRule as TieRule;
    if (!TIE_RULES.includes(tieRule)) return refuse(400, "A moneyline requires a tie rule");

    let store;
    try {
      store = researchStore();
    } catch (error) {
      if (error instanceof ConfigError) return refuse(503, error.message);
      throw error;
    }
    const result = await runGameBoard(
      {
        game,
        requestId: values.requestId || randomUUID(),
        nowIso,
        scheduleRetrievedAt: values.scheduleRetrievedAt || schedule.retrievedAt,
        sportsbook: values.sportsbook ?? "",
        observedAt,
        moneyline: { home: home.value, away: away.value, tieRule },
        manualEvidence: manual.entries,
        lean: values.lean,
        rationale: values.rationale,
      },
      {
        store,
        collect: evidenceCollector(),
        model: modelSource(),
        forecast: forecastSource(),
      },
    );
    if (result.board) redirect(303, `/board/${result.board.id}`);
    return refuse(400, result.ok ? "The board was not saved" : result.error);
  },
} satisfies Actions;
