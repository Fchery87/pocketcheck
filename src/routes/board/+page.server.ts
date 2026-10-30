import { fail, redirect } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { easternTime } from "#lib/format.ts";
import {
  localInputValue,
  parseManualEvidence,
  parseObservedAt,
} from "#lib/server/analysis/form.ts";
import type { BoardQuote } from "#lib/domain/board.ts";
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
  thesisDrafter,
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
  "spreadHomeLine",
  "spreadAwayLine",
  "spreadHome",
  "spreadAway",
  "totalLine",
  "totalOver",
  "totalUnder",
  "requestId",
  "parentId",
  "scheduleRetrievedAt",
  "protocolRegistrationId",
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

type QuoteRow = {
  sportsbook: string;
  market: string;
  selection: string;
  americanOdds: string;
  pointLine: string;
  observedAt: string;
};

const QUOTE_MARKETS = ["moneyline", "spread", "total"] as const;
const QUOTE_SELECTIONS = ["home", "away", "over", "under"] as const;

/** One row per entered quote. A blank row is ignored. A half-filled row is an error, with the typed text kept. */
function parseQuotes(
  data: FormData,
):
  | { ok: true; quotes: BoardQuote[]; rows: QuoteRow[] }
  | { ok: false; error: string; rows: QuoteRow[] } {
  const sportsbooks = data.getAll("quoteSportsbook").map(String);
  const markets = data.getAll("quoteMarket").map(String);
  const selections = data.getAll("quoteSelection").map(String);
  const prices = data.getAll("quoteOdds").map(String);
  const lines = data.getAll("quoteLine").map(String);
  const times = data.getAll("quoteObservedAt").map(String);
  const count = Math.max(sportsbooks.length, markets.length, selections.length, prices.length);
  const rows: QuoteRow[] = [];
  const quotes: BoardQuote[] = [];
  for (let index = 0; index < count; index += 1) {
    const row: QuoteRow = {
      sportsbook: (sportsbooks[index] ?? "").trim(),
      market: (markets[index] ?? "").trim(),
      selection: (selections[index] ?? "").trim(),
      americanOdds: (prices[index] ?? "").trim(),
      pointLine: (lines[index] ?? "").trim(),
      observedAt: (times[index] ?? "").trim(),
    };
    rows.push(row);
    const blank = !row.sportsbook && !row.americanOdds && !row.pointLine && !row.observedAt;
    if (blank) continue;
    const market = QUOTE_MARKETS.find((item) => item === row.market);
    const selection = QUOTE_SELECTIONS.find((item) => item === row.selection);
    const price = odds(row.americanOdds);
    const point = line(row.pointLine);
    const observedAt = parseObservedAt(row.observedAt);
    if (
      !row.sportsbook ||
      !market ||
      !selection ||
      !price.ok ||
      price.value === undefined ||
      !observedAt
    ) {
      return {
        ok: false,
        error: "A quote needs a sportsbook, market, side, American price, and time.",
        rows,
      };
    }
    if (!point.ok) return { ok: false, error: point.error, rows };
    if (market === "moneyline" && point.value !== undefined) {
      return { ok: false, error: "A moneyline quote has no point line.", rows };
    }
    if (market !== "moneyline" && point.value === undefined) {
      return { ok: false, error: `A ${market} quote needs its point line.`, rows };
    }
    quotes.push({
      sportsbook: row.sportsbook,
      market,
      selection,
      americanOdds: price.value,
      pointLine: point.value ?? null,
      observedAt,
    });
  }
  return { ok: true, quotes, rows };
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
  let registrations: Awaited<
    ReturnType<ReturnType<typeof researchStore>["listProtocolRegistrations"]>
  > = [];
  try {
    registrations = await researchStore().listProtocolRegistrations();
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
  }
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
    registrations,
  };
};

export const actions = {
  freeze: async ({ request }) => {
    const data = await request.formData();
    const values: Values = Object.fromEntries(FIELDS.map((name) => [name, field(data, name)]));
    const manual = parseManualEvidence(data);
    // Every failure hands the entered values back so nothing has to be retyped.
    const quotes = parseQuotes(data);
    const refuse = (status: number, error: string) =>
      fail(status, { error, values, manual: manual.rows, quotes: quotes.rows });
    if (!manual.ok) return refuse(400, manual.error);
    if (!quotes.ok) return refuse(400, quotes.error);
    const nowIso = now();
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
    const drafting = await thesisDrafter();
    if (!drafting.ok) return refuse(503, drafting.error);
    const registrationId = values.protocolRegistrationId;
    const registrations = registrationId ? await store.listProtocolRegistrations() : [];
    const registration = registrations.find((item) => item.id === registrationId);
    if (registrationId && !registration)
      return refuse(400, "Choose an existing evaluation registration.");
    if (
      registration &&
      (Date.parse(registration.registeredAt) >= Date.parse(nowIso) ||
        Date.parse(nowIso) > Date.parse(now()) ||
        Date.parse(nowIso) < Date.parse(registration.protocol.period.start) ||
        (registration.protocol.period.end !== null &&
          Date.parse(nowIso) >= Date.parse(registration.protocol.period.end)))
    ) {
      return refuse(400, "The board must be after registration and within the evaluation period.");
    }
    const freezeForecast = forecastSource();
    const result = await runGameBoard(
      {
        game,
        parentId: values.parentId || null,
        requestId: values.requestId || randomUUID(),
        ...(registration ? { protocolRegistrationId: registration.id } : {}),
        nowIso,
        scheduleRetrievedAt: schedule.retrievedAt,
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
        extraQuotes: quotes.quotes,
        manualEvidence: manual.entries,
        lean: values.lean,
        rationale: values.rationale,
      },
      {
        store,
        collect: evidenceCollector(),
        model: modelSource(),
        forecast: freezeForecast
          ? async (...args) => {
              const saved = await freezeForecast(...args);
              if (!saved || !registration) return saved;
              const market = args[2].market;
              if (
                saved.artifact.checksum !== registration.protocol.artifactChecksum ||
                saved.inputAvailability.version !== registration.protocol.inputAvailability ||
                !registration.protocol.markets.includes(market) ||
                Date.parse(saved.decisionCutoff) < Date.parse(registration.protocol.period.start) ||
                (registration.protocol.period.end !== null &&
                  Date.parse(saved.decisionCutoff) >= Date.parse(registration.protocol.period.end))
              ) {
                throw new Error(
                  "This forecasting artifact or market does not match the selected evaluation registration.",
                );
              }
              return { ...saved, protocolRegistrationId: registration.id };
            }
          : undefined,
        drafter: drafting.drafter,
      },
    );
    if (result.board) redirect(303, `/board/${result.board.id}`);
    return refuse(400, result.ok ? "The board was not saved" : result.error);
  },
} satisfies Actions;
