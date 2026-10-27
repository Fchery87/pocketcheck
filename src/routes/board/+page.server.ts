import { fail, redirect } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { easternTime } from "#lib/format.ts";
import { localInputValue, parseObservedAt } from "#lib/server/analysis/form.ts";
import type { TieRule } from "#lib/domain/offer.ts";
import type { GameBoard } from "#lib/server/analysis/board-store.ts";
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
  "spreadHomeLine",
  "spreadAwayLine",
  "spreadHome",
  "spreadAway",
  "totalLine",
  "totalOver",
  "totalUnder",
  "requestId",
  "parentId",
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

/** Blank stays unentered. Anything else must be a number, such as -3.5 or 44.5. */
function line(raw: string): { ok: true; value: number | undefined } | { ok: false; error: string } {
  if (raw === "") return { ok: true, value: undefined };
  const value = Number(raw.replace("−", "-"));
  if (!Number.isFinite(value)) return { ok: false, error: `Invalid point line: ${raw}` };
  return { ok: true, value };
}

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/** The typed values of a frozen board, so a refresh starts from its prices. */
function prefill(board: GameBoard): Values {
  const values: Values = {
    gameId: board.game.id,
    sportsbook: board.sportsbook,
    parentId: board.id,
  };
  for (const { market, offers } of board.markets) {
    const [first, second] = offers;
    if (market === "moneyline") {
      values.moneylineHome = signed(first.americanOdds);
      values.moneylineAway = signed(second.americanOdds);
      values.tieRule = first.rules.tie ?? undefined;
    } else if (market === "spread") {
      values.spreadHomeLine = signed(first.pointLine ?? 0);
      values.spreadAwayLine = signed(second.pointLine ?? 0);
      values.spreadHome = signed(first.americanOdds);
      values.spreadAway = signed(second.americanOdds);
    } else {
      values.totalLine = String(first.pointLine ?? "");
      values.totalOver = signed(first.americanOdds);
      values.totalUnder = signed(second.americanOdds);
    }
  }
  return values;
}

export const load: PageServerLoad = async ({ url }) => {
  const nowIso = now();
  const refreshId = url.searchParams.get("refresh");
  let refresh: { values: Values; away: string; home: string; kickoffLabel: string } | null = null;
  let refreshError: string | null = null;
  if (refreshId) {
    try {
      const parent = await researchStore().getBoard(refreshId);
      if (parent?.status === "completed") {
        refresh = {
          values: prefill(parent),
          away: parent.game.away,
          home: parent.game.home,
          kickoffLabel: easternTime(parent.game.kickoff),
        };
      } else {
        refreshError = "Only a frozen game board can be refreshed.";
      }
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      refreshError = error.message;
    }
  }
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
    refresh,
    refreshError,
    observedDefault: localInputValue(nowIso),
    requestId: randomUUID(),
    cutoffAt: nowIso,
  };
};

export const actions = {
  freeze: async ({ request }) => {
    const data = await request.formData();
    const values: Values = Object.fromEntries(FIELDS.map((name) => [name, field(data, name)]));
    // Every failure hands the entered values back so nothing has to be retyped.
    const refuse = (status: number, error: string) => fail(status, { error, values });
    const cutoffAt = values.cutoffAt ?? "";
    const nowIso = Number.isFinite(Date.parse(cutoffAt)) ? new Date(cutoffAt).toISOString() : now();
    const schedule = readSchedule(schedulePath());
    if (!schedule.ok) return refuse(503, schedule.reason);
    const game = schedule.games.find((item) => item.id === values.gameId);
    if (!game) return refuse(400, "Choose a game");
    if (!upcomingGames([game], nowIso).length) return refuse(400, "The game has already started");
    const observedAt = parseObservedAt(values.observedAt ?? "");
    if (!observedAt) return refuse(400, "Enter when you observed these prices");
    const parsed = {
      moneylineHome: odds(values.moneylineHome ?? ""),
      moneylineAway: odds(values.moneylineAway ?? ""),
      spreadHome: odds(values.spreadHome ?? ""),
      spreadAway: odds(values.spreadAway ?? ""),
      totalOver: odds(values.totalOver ?? ""),
      totalUnder: odds(values.totalUnder ?? ""),
      spreadHomeLine: line(values.spreadHomeLine ?? ""),
      spreadAwayLine: line(values.spreadAwayLine ?? ""),
      totalLine: line(values.totalLine ?? ""),
    };
    for (const item of Object.values(parsed)) if (!item.ok) return refuse(400, item.error);
    const n = (key: keyof typeof parsed) => {
      const item = parsed[key];
      return item.ok ? item.value : undefined;
    };
    const tieRule = TIE_RULES.find((rule) => rule === values.tieRule);
    const totalLine = n("totalLine");

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
        parentId: values.parentId || null,
        requestId: values.requestId || randomUUID(),
        nowIso,
        scheduleRetrievedAt: values.scheduleRetrievedAt || schedule.retrievedAt,
        sportsbook: values.sportsbook ?? "",
        observedAt,
        moneyline: {
          home: n("moneylineHome"),
          away: n("moneylineAway"),
          tieRule,
        },
        spread: {
          homeLine: n("spreadHomeLine"),
          awayLine: n("spreadAwayLine"),
          home: n("spreadHome"),
          away: n("spreadAway"),
        },
        total: {
          overLine: totalLine,
          underLine: totalLine,
          over: n("totalOver"),
          under: n("totalUnder"),
        },
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
