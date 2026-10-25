import { kickoffMs, type CompletedGame } from "./games.ts";

export const FEATURE_DEFINITIONS = [
  {
    name: "home_prior_margin",
    description:
      "Home team's recency-weighted point margin in games strictly before this kickoff, shrunk toward 0. See featureParameters.",
  },
  {
    name: "away_prior_margin",
    description:
      "Away team's recency-weighted point margin in games strictly before this kickoff, shrunk toward 0.",
  },
  {
    name: "home_prior_points_for",
    description:
      "Home team's recency-weighted points scored in strictly prior games, shrunk toward the league mean of strictly prior games.",
  },
  {
    name: "away_prior_points_for",
    description: "Away team's recency-weighted points scored, shrunk toward the league mean.",
  },
  {
    name: "home_prior_points_against",
    description: "Home team's recency-weighted points allowed, shrunk toward the league mean.",
  },
  {
    name: "away_prior_points_against",
    description: "Away team's recency-weighted points allowed, shrunk toward the league mean.",
  },
  {
    name: "home_rest_days",
    description:
      "Days since the home team's previous kickoff in the same season. 7 for its first game of a season.",
  },
  {
    name: "away_rest_days",
    description:
      "Days since the away team's previous kickoff in the same season. 7 for its first game of a season.",
  },
  {
    name: "home_indicator",
    description: "1 when the game is not neutral, otherwise 0.",
  },
] as const;

export type FeatureName = (typeof FEATURE_DEFINITIONS)[number]["name"];

export type FeatureRow = {
  gameId: string;
  kickoff: string;
  features: Record<FeatureName, number>;
};

/**
 * How team form is weighted. Each later game multiplies earlier weights by gameDecay. A new
 * season multiplies them by seasonCarry. priorWeight is how many games of league-average form
 * every team starts with.
 */
export type FeatureParameters = {
  gameDecay: number;
  seasonCarry: number;
  priorWeight: number;
};

// Chosen by validation RMSE on 2017-2021 margins, fit through 2016. See docs/research/model-evaluation.md.
export const DEFAULT_FEATURES: FeatureParameters = {
  gameDecay: 0.94,
  seasonCarry: 0.5,
  priorWeight: 2,
};

type TeamState = {
  season: number | null;
  weight: number;
  marginSum: number;
  pointsFor: number;
  pointsAgainst: number;
  lastKickoffMs: number | null;
};

const MS_PER_DAY = 86_400_000;
const DEFAULT_REST_DAYS = 7;

/** The NFL season a game belongs to. Games before March belong to the previous fall's season. */
export function seasonOf(game: { kickoff: string; season?: number }): number {
  if (game.season !== undefined) return game.season;
  const date = new Date(kickoffMs(game));
  return date.getUTCMonth() < 2 ? date.getUTCFullYear() - 1 : date.getUTCFullYear();
}

function emptyState(): TeamState {
  return {
    season: null,
    weight: 0,
    marginSum: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    lastKickoffMs: null,
  };
}

function scale(state: TeamState, factor: number): void {
  state.weight *= factor;
  state.marginSum *= factor;
  state.pointsFor *= factor;
  state.pointsAgainst *= factor;
}

/** Carries form into a new season at reduced weight, and forgets the previous kickoff for rest. */
function enterSeason(state: TeamState, season: number, params: FeatureParameters): void {
  if (state.season === season) return;
  if (state.season !== null) scale(state, params.seasonCarry);
  state.season = season;
  state.lastKickoffMs = null;
}

function restDays(state: TeamState, kickoff: number): number {
  if (state.lastKickoffMs === null) return DEFAULT_REST_DAYS;
  return (kickoff - state.lastKickoffMs) / MS_PER_DAY;
}

function applyGame(
  state: TeamState,
  pointsFor: number,
  pointsAgainst: number,
  kickoff: number,
  params: FeatureParameters,
): void {
  scale(state, params.gameDecay);
  state.weight += 1;
  state.marginSum += pointsFor - pointsAgainst;
  state.pointsFor += pointsFor;
  state.pointsAgainst += pointsAgainst;
  state.lastKickoffMs = kickoff;
}

export function buildFeatureRows(
  games: readonly CompletedGame[],
  params: FeatureParameters = DEFAULT_FEATURES,
): FeatureRow[] {
  const ordered = [...games].sort((a, b) => {
    const delta = kickoffMs(a) - kickoffMs(b);
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  });
  const teams = new Map<string, TeamState>();
  const rows: FeatureRow[] = [];
  let leaguePoints = 0;
  let leagueTeamGames = 0;

  for (const game of ordered) {
    const home = teams.get(game.home) ?? emptyState();
    const away = teams.get(game.away) ?? emptyState();
    const at = kickoffMs(game);
    const season = seasonOf(game);
    enterSeason(home, season, params);
    enterSeason(away, season, params);
    const league = leagueTeamGames === 0 ? 0 : leaguePoints / leagueTeamGames;
    const shrunk = (state: TeamState, sum: number, toward: number) => {
      const weight = state.weight + params.priorWeight;
      return weight === 0 ? toward : (sum + params.priorWeight * toward) / weight;
    };

    rows.push({
      gameId: game.id,
      kickoff: game.kickoff,
      features: {
        home_prior_margin: shrunk(home, home.marginSum, 0),
        away_prior_margin: shrunk(away, away.marginSum, 0),
        home_prior_points_for: shrunk(home, home.pointsFor, league),
        away_prior_points_for: shrunk(away, away.pointsFor, league),
        home_prior_points_against: shrunk(home, home.pointsAgainst, league),
        away_prior_points_against: shrunk(away, away.pointsAgainst, league),
        home_rest_days: restDays(home, at),
        away_rest_days: restDays(away, at),
        home_indicator: game.neutral ? 0 : 1,
      },
    });

    teams.set(game.home, home);
    teams.set(game.away, away);
    applyGame(home, game.homeScore, game.awayScore, at, params);
    applyGame(away, game.awayScore, game.homeScore, at, params);
    leaguePoints += game.homeScore + game.awayScore;
    leagueTeamGames += 2;
  }

  return rows;
}
