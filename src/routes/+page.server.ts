import { resolve } from "node:path";
import { redirect } from "@sveltejs/kit";
import { fixtureGameName } from "#lib/server/fixtures.ts";
import { loadFixtureGames } from "#lib/server/analysis/games.ts";
import { runAnalysis } from "#lib/server/analysis/run.ts";
import type { Actions, PageServerLoad } from "./$types";

const FIXTURE_NOW = "2026-10-25T16:00:00.000Z";
const gamesPath = resolve("tests/fixtures/sources/games-minimized.csv");

function displayParts(kickoff: string) {
  const date = new Date(kickoff);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
  const kickoffLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
  return { dateLabel, kickoffLabel };
}

export const load: PageServerLoad = () => {
  const games = loadFixtureGames(gamesPath, FIXTURE_NOW).map((game) => {
    const labels = displayParts(game.kickoff);
    const started = Boolean(game.finalScore) || Date.parse(game.kickoff) <= Date.parse(FIXTURE_NOW);
    return {
      id: game.id,
      away: game.away,
      home: game.home,
      venue: game.venue.name,
      kickoff: game.kickoff,
      started,
      ...labels,
    };
  });
  return { gameName: fixtureGameName, games };
};

function field(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export const actions = {
  analyze: async ({ request }) => {
    const data = await request.formData();
    const games = loadFixtureGames(gamesPath, FIXTURE_NOW);
    const game = games.find((item) => item.id === field(data, "gameId"));
    if (!game) {
      return { gameName: fixtureGameName, error: "Choose a game", gameId: "" };
    }
    const pointLineRaw = field(data, "pointLine");
    const result = await runAnalysis({
      game,
      nowIso: FIXTURE_NOW,
      sportsbook: field(data, "sportsbook"),
      market: field(data, "market") as "moneyline" | "spread" | "total",
      selection: field(data, "selection") as "home" | "away" | "over" | "under",
      pointLine: pointLineRaw === "" ? undefined : Number(pointLineRaw),
      americanOdds: Number(field(data, "americanOdds")),
      observedAt: field(data, "observedAt"),
      tieRule: field(data, "tieRule") as "push" | "loss" | "win" | "void",
      lean: field(data, "lean"),
      rationale: field(data, "rationale"),
      parentId: field(data, "parentId") || null,
    });
    if (!result.ok) {
      return {
        gameName: fixtureGameName,
        error: result.error,
        gameId: game.id,
        stages: result.run?.stages ?? ["checking inputs"],
      };
    }
    redirect(303, `/analysis/${result.run.id}`);
  },
} satisfies Actions;
