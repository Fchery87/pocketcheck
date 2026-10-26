import { describe, expect, it } from "vite-plus/test";
import {
  buildFeatureRows,
  DEFAULT_FEATURES,
  seasonOf,
} from "../../src/lib/server/models/features.ts";
import type { CompletedGame } from "../../src/lib/server/models/games.ts";

function game(
  id: string,
  kickoff: string,
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
  season?: number,
): CompletedGame {
  return { id, kickoff, home, away, homeScore, awayScore, ...(season ? { season } : {}) };
}

const PLAIN = { ...DEFAULT_FEATURES, gameDecay: 1, seasonCarry: 1, priorWeight: 0 };

describe("seasons", () => {
  it("puts a January playoff game in the season that started the previous fall", () => {
    expect(seasonOf({ kickoff: "2024-01-14T21:30:00Z" })).toBe(2023);
    expect(seasonOf({ kickoff: "2023-09-07T00:20:00Z" })).toBe(2023);
    expect(seasonOf({ kickoff: "2024-01-14T21:30:00Z", season: 2024 })).toBe(2024);
  });
});

describe("season-aware rest days", () => {
  const games = [
    game("playoff", "2024-01-14T21:30:00Z", "A", "B", 20, 17),
    game("opener", "2024-09-08T17:00:00Z", "A", "C", 24, 10),
    game("week2", "2024-09-15T17:00:00Z", "A", "D", 24, 10),
    game("after-bye", "2024-09-29T17:00:00Z", "A", "E", 24, 10),
  ];
  const rows = new Map(buildFeatureRows(games).map((row) => [row.gameId, row.features]));

  it("treats a season opener as normal rest, not the whole offseason", () => {
    expect(rows.get("opener")?.home_rest_days).toBe(7);
  });

  it("still counts a bye week inside a season", () => {
    expect(rows.get("week2")?.home_rest_days).toBe(7);
    expect(rows.get("after-bye")?.home_rest_days).toBe(14);
  });
});

describe("recency-weighted team form", () => {
  // Team A dominated last season and has lost every game this season.
  const games: CompletedGame[] = [];
  for (let week = 0; week < 16; week += 1) {
    const day = String(week + 1).padStart(2, "0");
    games.push(game(`old-${week}`, `2023-10-${day}T17:00:00Z`, "A", `X${week}`, 30, 10));
  }
  for (let week = 0; week < 4; week += 1) {
    const day = String(8 + week * 7).padStart(2, "0");
    games.push(game(`new-${week}`, `2024-09-${day}T17:00:00Z`, "A", `Y${week}`, 10, 20));
  }
  games.push(game("next", "2024-10-06T17:00:00Z", "A", "Z", 0, 0));
  const plainMean = (16 * 20 + 4 * -10) / 20;

  it("reproduces the plain all-games mean with no decay, carry loss, or prior", () => {
    const row = buildFeatureRows(games, PLAIN).find((item) => item.gameId === "next");
    expect(row?.features.home_prior_margin).toBeCloseTo(plainMean, 10);
  });

  it("weights this season's games above last season's by default", () => {
    const row = buildFeatureRows(games).find((item) => item.gameId === "next");
    expect(row?.features.home_prior_margin).toBeLessThan(plainMean);
  });

  it("starts a team with no history at the league average instead of zero points", () => {
    const rows = buildFeatureRows([
      game("first", "2024-09-08T17:00:00Z", "A", "B", 30, 20),
      game("newcomer", "2024-09-15T17:00:00Z", "C", "D", 0, 0),
    ]);
    const newcomer = rows.find((row) => row.gameId === "newcomer")?.features;
    expect(newcomer?.home_prior_points_for).toBe(25);
    expect(newcomer?.home_prior_points_against).toBe(25);
    expect(newcomer?.home_prior_margin).toBe(0);
  });
});

describe("starting quarterback", () => {
  const start = (id: string, day: number, qb: string | undefined): CompletedGame => ({
    ...game(id, `2024-09-${String(day).padStart(2, "0")}T17:00:00Z`, "A", `X${day}`, 20, 17),
    ...(qb ? { homeQb: qb } : {}),
  });
  const games = [
    start("w1", 1, "starter"),
    start("w2", 8, "starter"),
    start("w3", 15, "starter"),
    start("w4", 22, "backup"),
    start("w5", 29, undefined),
  ];
  const rows = new Map(buildFeatureRows(games).map((row) => [row.gameId, row.features]));

  it("assumes a team's first game is started by its regular quarterback", () => {
    expect(rows.get("w1")?.home_qb_share).toBe(1);
  });

  it("is the share of the team's recent games this quarterback started", () => {
    expect(rows.get("w3")?.home_qb_share).toBe(1);
    expect(rows.get("w4")?.home_qb_share).toBe(0);
  });

  it("assumes the most frequent recent starter when the starter is not known yet", () => {
    expect(rows.get("w5")?.home_qb_share).toBe(0.75);
  });

  it("only looks at the last eight games", () => {
    const long = Array.from({ length: 12 }, (_, week) =>
      start(`g${week}`, week + 1, week < 3 ? "old" : "new"),
    );
    long.push(start("next", 20, "old"));
    const next = buildFeatureRows(long).find((row) => row.gameId === "next");
    expect(next?.features.home_qb_share).toBe(0);
  });
});

describe("quarterback rating", () => {
  const params = { ...DEFAULT_FEATURES, qbDecay: 1, qbPriorWeight: 2, qbReplacement: -3 };
  const played = (
    id: string,
    day: number,
    home: string,
    homeQb: string | undefined,
    homeScore: number,
    awayScore: number,
  ): CompletedGame => ({
    ...game(
      id,
      `2024-09-${String(day).padStart(2, "0")}T17:00:00Z`,
      home,
      `X${day}`,
      homeScore,
      awayScore,
    ),
    ...(homeQb ? { homeQb } : {}),
  });
  const rows = new Map(
    buildFeatureRows(
      [
        played("a1", 1, "A", "q", 30, 20),
        played("a2", 8, "A", "q", 40, 20),
        played("b1", 15, "B", "q", 0, 0),
        played("a3", 22, "A", "rookie", 0, 0),
        played("a4", 29, "A", undefined, 0, 0),
      ],
      params,
    ).map((row) => [row.gameId, row.features]),
  );

  it("follows a quarterback to a new team, shrunk toward replacement level", () => {
    // Margins +10 and +20 with two games of replacement level at -3: (30 - 6) / 4.
    expect(rows.get("b1")?.home_qb_rating).toBe(6);
  });

  it("rates a quarterback with no starts at replacement level", () => {
    expect(rows.get("a1")?.home_qb_rating).toBe(-3);
    expect(rows.get("a3")?.home_qb_rating).toBe(-3);
  });

  it("rates an unknown starter as the team's most frequent recent starter", () => {
    // Team A's usual starter is q, who has since played b1 at a margin of 0: (30 + 0 - 6) / 5.
    expect(rows.get("a4")?.home_qb_rating).toBe(4.8);
  });
});
