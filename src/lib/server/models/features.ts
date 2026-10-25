import { kickoffMs, type CompletedGame } from "./games.ts";

export const FEATURE_DEFINITIONS = [
  {
    name: "home_prior_margin",
    description:
      "Mean home-team point margin in completed games whose kickoff is strictly before this kickoff. Zero when the team has no prior games.",
  },
  {
    name: "away_prior_margin",
    description:
      "Mean away-team point margin in completed games whose kickoff is strictly before this kickoff. Zero when the team has no prior games.",
  },
  {
    name: "home_prior_points_for",
    description: "Mean points scored by the home team in strictly prior games.",
  },
  {
    name: "away_prior_points_for",
    description: "Mean points scored by the away team in strictly prior games.",
  },
  {
    name: "home_prior_points_against",
    description: "Mean points allowed by the home team in strictly prior games.",
  },
  {
    name: "away_prior_points_against",
    description: "Mean points allowed by the away team in strictly prior games.",
  },
  {
    name: "home_rest_days",
    description:
      "Days since the home team's previous kickoff. 7 when the team has no prior game.",
  },
  {
    name: "away_rest_days",
    description:
      "Days since the away team's previous kickoff. 7 when the team has no prior game.",
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

type TeamState = {
  games: number;
  marginSum: number;
  pointsFor: number;
  pointsAgainst: number;
  lastKickoffMs: number | null;
};

const MS_PER_DAY = 86_400_000;
const DEFAULT_REST_DAYS = 7;

function emptyState(): TeamState {
  return {
    games: 0,
    marginSum: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    lastKickoffMs: null,
  };
}

function restDays(state: TeamState, kickoff: number): number {
  if (state.lastKickoffMs === null) return DEFAULT_REST_DAYS;
  return (kickoff - state.lastKickoffMs) / MS_PER_DAY;
}

function applyGame(state: TeamState, pointsFor: number, pointsAgainst: number, kickoff: number): void {
  state.games += 1;
  state.marginSum += pointsFor - pointsAgainst;
  state.pointsFor += pointsFor;
  state.pointsAgainst += pointsAgainst;
  state.lastKickoffMs = kickoff;
}

export function buildFeatureRows(games: readonly CompletedGame[]): FeatureRow[] {
  const ordered = [...games].sort((a, b) => {
    const delta = kickoffMs(a) - kickoffMs(b);
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  });
  const teams = new Map<string, TeamState>();
  const rows: FeatureRow[] = [];

  for (const game of ordered) {
    const home = teams.get(game.home) ?? emptyState();
    const away = teams.get(game.away) ?? emptyState();
    const at = kickoffMs(game);
    const mean = (state: TeamState, sum: number) => (state.games === 0 ? 0 : sum / state.games);

    rows.push({
      gameId: game.id,
      kickoff: game.kickoff,
      features: {
        home_prior_margin: mean(home, home.marginSum),
        away_prior_margin: mean(away, away.marginSum),
        home_prior_points_for: mean(home, home.pointsFor),
        away_prior_points_for: mean(away, away.pointsFor),
        home_prior_points_against: mean(home, home.pointsAgainst),
        away_prior_points_against: mean(away, away.pointsAgainst),
        home_rest_days: restDays(home, at),
        away_rest_days: restDays(away, at),
        home_indicator: game.neutral ? 0 : 1,
      },
    });

    teams.set(game.home, home);
    teams.set(game.away, away);
    applyGame(home, game.homeScore, game.awayScore, at);
    applyGame(away, game.awayScore, game.homeScore, at);
  }

  return rows;
}
