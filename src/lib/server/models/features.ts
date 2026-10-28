import { kickoffMs, resultAvailableMs, type CompletedGame } from "./games.ts";

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
    name: "home_qb_share",
    description:
      "Share of the home team's last 8 games started by this game's starting quarterback. When the starter is not known, the team's most frequent recent starter. 1 before a team's first game.",
  },
  {
    name: "away_qb_share",
    description: "The same quarterback share for the away team.",
  },
  {
    name: "home_qb_rating",
    description:
      "Recency-weighted team margin in every strictly earlier game the home starter started, for any team, shrunk toward qbReplacement. The same starter rule as home_qb_share.",
  },
  {
    name: "away_qb_rating",
    description: "The same quarterback rating for the away team's starter.",
  },
  {
    name: "home_indicator",
    description: "1 when the game is not neutral, otherwise 0.",
  },
] as const;

export type FeatureName = (typeof FEATURE_DEFINITIONS)[number]["name"];

/**
 * Features dropped together for an ablation. A group is kept only when dropping it makes
 * held-out log loss worse. Later features join a group here.
 */
export const INPUT_GROUPS: readonly { group: string; features: readonly FeatureName[] }[] = [
  {
    group: "score margin",
    features: ["home_prior_margin", "away_prior_margin"],
  },
  {
    group: "points scored and allowed",
    features: [
      "home_prior_points_for",
      "away_prior_points_for",
      "home_prior_points_against",
      "away_prior_points_against",
    ],
  },
  { group: "rest", features: ["home_rest_days", "away_rest_days"] },
  {
    group: "quarterback",
    features: ["home_qb_share", "away_qb_share", "home_qb_rating", "away_qb_rating"],
  },
  { group: "home field", features: ["home_indicator"] },
];

export type FeatureRow = {
  gameId: string;
  kickoff: string;
  resultAvailableAt?: string;
  features: Record<FeatureName, number>;
};

/**
 * How team form is weighted. Each later game multiplies earlier weights by gameDecay. A new
 * season multiplies them by seasonCarry. priorWeight is how many games of league-average form
 * every team starts with. A quarterback's rating decays by qbDecay per start and starts with
 * qbPriorWeight starts at qbReplacement points of margin.
 */
export type FeatureParameters = {
  gameDecay: number;
  seasonCarry: number;
  priorWeight: number;
  qbDecay: number;
  qbPriorWeight: number;
  qbReplacement: number;
};

// Chosen by validation RMSE on 2017-2021 margins, fit through 2016. See docs/research/model-evaluation.md.
export const DEFAULT_FEATURES: FeatureParameters = {
  gameDecay: 0.94,
  seasonCarry: 0.5,
  priorWeight: 2,
  qbDecay: 0.97,
  qbPriorWeight: 4,
  qbReplacement: -3,
};

type TeamState = {
  season: number | null;
  weight: number;
  marginSum: number;
  pointsFor: number;
  pointsAgainst: number;
  lastKickoffMs: number | null;
  /** Starting quarterbacks of the team's most recent games, oldest first, across seasons. */
  recentQbs: string[];
};

const MS_PER_DAY = 86_400_000;
const DEFAULT_REST_DAYS = 7;
const QB_WINDOW = 8;

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
    recentQbs: [],
  };
}

/** The quarterback with the most of the team's recent starts, the latest on a tie. */
function usualStarter(state: TeamState): string | undefined {
  let best: string | undefined;
  let bestCount = 0;
  for (const id of state.recentQbs) {
    const count = state.recentQbs.filter((start) => start === id).length;
    if (count >= bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

function qbShare(state: TeamState, qb: string | undefined): number {
  const starts = state.recentQbs;
  const starter = qb ?? usualStarter(state);
  if (starts.length === 0 || starter === undefined) return 1;
  return starts.filter((start) => start === starter).length / starts.length;
}

type QbState = { weight: number; marginSum: number };

function recordStarter(state: TeamState, qb: string | undefined): void {
  if (qb === undefined) return;
  state.recentQbs.push(qb);
  if (state.recentQbs.length > QB_WINDOW) state.recentQbs.shift();
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

/** A game to describe before it is played. */
export type UpcomingGame = Omit<CompletedGame, "homeScore" | "awayScore">;

function byKickoff(a: UpcomingGame, b: UpcomingGame): number {
  const delta = kickoffMs(a) - kickoffMs(b);
  return delta !== 0 ? delta : a.id.localeCompare(b.id);
}

/** Team and league state, advanced only when a result is available. */
function featureBuilder(params: FeatureParameters) {
  const teams = new Map<string, TeamState>();
  const quarterbacks = new Map<string, QbState>();
  let leaguePoints = 0;
  let leagueTeamGames = 0;
  const stateOf = (team: string) => {
    const state = teams.get(team) ?? emptyState();
    teams.set(team, state);
    return state;
  };

  const rating = (team: TeamState, qb: string | undefined) => {
    const starter = qb ?? usualStarter(team);
    const state = starter === undefined ? undefined : quarterbacks.get(starter);
    const weight = (state?.weight ?? 0) + params.qbPriorWeight;
    if (weight === 0) return params.qbReplacement;
    return ((state?.marginSum ?? 0) + params.qbPriorWeight * params.qbReplacement) / weight;
  };
  const recordRating = (qb: string | undefined, margin: number) => {
    if (qb === undefined) return;
    const state = quarterbacks.get(qb) ?? { weight: 0, marginSum: 0 };
    state.weight = state.weight * params.qbDecay + 1;
    state.marginSum = state.marginSum * params.qbDecay + margin;
    quarterbacks.set(qb, state);
  };

  return {
    row(game: UpcomingGame): FeatureRow {
      const home = stateOf(game.home);
      const away = stateOf(game.away);
      const at = kickoffMs(game);
      const season = seasonOf(game);
      enterSeason(home, season, params);
      enterSeason(away, season, params);
      const league = leagueTeamGames === 0 ? 0 : leaguePoints / leagueTeamGames;
      const shrunk = (state: TeamState, sum: number, toward: number) => {
        const weight = state.weight + params.priorWeight;
        return weight === 0 ? toward : (sum + params.priorWeight * toward) / weight;
      };
      return {
        gameId: game.id,
        kickoff: game.kickoff,
        ...(game.resultAvailableAt ? { resultAvailableAt: game.resultAvailableAt } : {}),
        features: {
          home_prior_margin: shrunk(home, home.marginSum, 0),
          away_prior_margin: shrunk(away, away.marginSum, 0),
          home_prior_points_for: shrunk(home, home.pointsFor, league),
          away_prior_points_for: shrunk(away, away.pointsFor, league),
          home_prior_points_against: shrunk(home, home.pointsAgainst, league),
          away_prior_points_against: shrunk(away, away.pointsAgainst, league),
          home_rest_days: restDays(home, at),
          away_rest_days: restDays(away, at),
          home_qb_share: qbShare(home, game.homeQb),
          away_qb_share: qbShare(away, game.awayQb),
          home_qb_rating: rating(home, game.homeQb),
          away_qb_rating: rating(away, game.awayQb),
          home_indicator: game.neutral ? 0 : 1,
        },
      };
    },
    apply(game: CompletedGame): void {
      const home = stateOf(game.home);
      const away = stateOf(game.away);
      const at = kickoffMs(game);
      enterSeason(home, seasonOf(game), params);
      enterSeason(away, seasonOf(game), params);
      applyGame(home, game.homeScore, game.awayScore, at, params);
      applyGame(away, game.awayScore, game.homeScore, at, params);
      recordStarter(home, game.homeQb);
      recordStarter(away, game.awayQb);
      recordRating(game.homeQb, game.homeScore - game.awayScore);
      recordRating(game.awayQb, game.awayScore - game.homeScore);
      leaguePoints += game.homeScore + game.awayScore;
      leagueTeamGames += 2;
    },
  };
}

export function buildFeatureRows(
  games: readonly CompletedGame[],
  params: FeatureParameters = DEFAULT_FEATURES,
): FeatureRow[] {
  const builder = featureBuilder(params);
  const ordered = [...games].sort(byKickoff);
  const pending = [...ordered].sort(
    (a, b) => resultAvailableMs(a) - resultAvailableMs(b) || byKickoff(a, b),
  );
  let applied = 0;
  const rows: FeatureRow[] = [];
  for (let from = 0; from < ordered.length;) {
    const cutoff = kickoffMs(ordered[from]!);
    let to = from + 1;
    while (to < ordered.length && kickoffMs(ordered[to]!) === cutoff) to += 1;
    while (applied < pending.length && resultAvailableMs(pending[applied]!) < cutoff) {
      builder.apply(pending[applied]!);
      applied += 1;
    }
    rows.push(...ordered.slice(from, to).map((game) => builder.row(game)));
    from = to;
  }
  return rows;
}

/** Uses only results available strictly before the decision cutoff, defaulting to kickoff. */
export function featureRowForGame(
  history: readonly CompletedGame[],
  game: UpcomingGame,
  params: FeatureParameters = DEFAULT_FEATURES,
  cutoff: string = game.kickoff,
): FeatureRow {
  const builder = featureBuilder(params);
  const before = history.filter((past) => resultAvailableMs(past) < kickoffMs({ kickoff: cutoff }));
  for (const past of [...before].sort(
    (a, b) => resultAvailableMs(a) - resultAvailableMs(b) || byKickoff(a, b),
  )) {
    builder.apply(past);
  }
  return builder.row(game);
}
