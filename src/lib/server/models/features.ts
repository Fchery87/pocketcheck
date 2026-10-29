import { distanceKm, venueOf, zonesCrossed } from "../sources/venues.ts";
import { kickoffMs, resultAvailableMs, type CompletedGame, type UnitRates } from "./games.ts";

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
  {
    name: "home_qb_efficiency",
    description:
      "Home starter's recency-weighted EPA per dropback plus completion percentage over expected, shrunk toward qbReplacement by qbPriorWeight. Uses only plays from games eligible before the cutoff.",
  },
  {
    name: "away_qb_efficiency",
    description: "The same quarterback efficiency for the away starter.",
  },
  {
    name: "home_offense_epa",
    description:
      "Home offense's opponent-adjusted, recency-weighted EPA per play, carried from last season at seasonCarry.",
  },
  {
    name: "away_offense_epa",
    description: "The same offensive efficiency for the away team.",
  },
  {
    name: "home_defense_epa",
    description:
      "Home defense's opponent-adjusted EPA per play allowed, negated so higher is better.",
  },
  {
    name: "away_defense_epa",
    description: "The same defensive efficiency for the away team.",
  },
  {
    name: "pace_seconds",
    description: "Combined seconds per offensive play for both teams. Lower is faster.",
  },
  {
    name: "pass_rate_over_expected",
    description: "Combined pass rate over expected for both teams.",
  },
  {
    name: "rest_differential",
    description: "Home rest days minus away rest days.",
  },
  {
    name: "short_week",
    description: "1 when either team is on fewer than 6 days of rest.",
  },
  {
    name: "off_bye",
    description: "1 when either team is coming off 13 or more days of rest.",
  },
  {
    name: "home_offense_pass_epa",
    description:
      "Home offense's opponent-adjusted passing EPA per play, recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "away_offense_pass_epa",
    description:
      "Away offense's opponent-adjusted passing EPA per play, recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "home_offense_rush_epa",
    description:
      "Home offense's opponent-adjusted rushing EPA per play, recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "away_offense_rush_epa",
    description:
      "Away offense's opponent-adjusted rushing EPA per play, recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "home_defense_pass_epa",
    description:
      "Home defense's opponent-adjusted passing EPA prevented per play, recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "away_defense_pass_epa",
    description:
      "Away defense's opponent-adjusted passing EPA prevented per play, recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "home_defense_rush_epa",
    description:
      "Home defense's opponent-adjusted rushing EPA prevented per play, recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "away_defense_rush_epa",
    description:
      "Away defense's opponent-adjusted rushing EPA prevented per play, recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "home_offense_success",
    description:
      "Home offense's opponent-adjusted success rate, recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "away_offense_success",
    description:
      "Away offense's opponent-adjusted success rate, recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "home_defense_success",
    description:
      "Home defense's opponent-adjusted success rate prevented, recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "away_defense_success",
    description:
      "Away defense's opponent-adjusted success rate prevented, recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "home_offense_early_epa",
    description:
      "Home offense's opponent-adjusted early-down EPA per play, recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "away_offense_early_epa",
    description:
      "Away offense's opponent-adjusted early-down EPA per play, recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "home_defense_early_epa",
    description:
      "Home defense's opponent-adjusted early-down EPA prevented per play, recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "away_defense_early_epa",
    description:
      "Away defense's opponent-adjusted early-down EPA prevented per play, recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "home_offense_explosive",
    description:
      "Home offense's opponent-adjusted explosive play rate (20+ yards), recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "away_offense_explosive",
    description:
      "Away offense's opponent-adjusted explosive play rate (20+ yards), recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "home_defense_explosive",
    description:
      "Home defense's opponent-adjusted explosive play rate prevented, recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "away_defense_explosive",
    description:
      "Away defense's opponent-adjusted explosive play rate prevented, recency-weighted and shrunk toward the league mean. Carried from last season at seasonCarry.",
  },
  {
    name: "home_turnover_margin",
    description:
      "Home takeaways minus giveaways per game, recency-weighted and regressed heavily toward 0 by turnoverRegression games.",
  },
  {
    name: "away_turnover_margin",
    description:
      "Away takeaways minus giveaways per game, recency-weighted and regressed heavily toward 0 by turnoverRegression games.",
  },
  {
    name: "home_travel_km",
    description:
      "Thousands of kilometers home team travels from its home stadium to this game's stadium. 0 at home.",
  },
  {
    name: "away_travel_km",
    description:
      "Thousands of kilometers away team travels from its home stadium to this game's stadium. 0 at home.",
  },
  {
    name: "home_zones_crossed",
    description:
      "Time zones home team crosses to reach this game's stadium, by 15-degree meridian.",
  },
  {
    name: "away_zones_crossed",
    description:
      "Time zones away team crosses to reach this game's stadium, by 15-degree meridian.",
  },
  {
    name: "international",
    description:
      "1 when the stadium is outside the United States, whichever club is designated home.",
  },
  {
    name: "venue_elevation_km",
    description: "Stadium elevation in kilometers.",
  },
  {
    name: "closed_roof",
    description: "1 when the roof is a dome or closed.",
  },
  {
    name: "turf",
    description: "1 when the surface is not natural grass.",
  },
] as const;

export type FeatureName = (typeof FEATURE_DEFINITIONS)[number]["name"];

/**
 * Features dropped together for an ablation. A group is kept only when dropping it makes
 * held-out log loss worse. Later features join a group here.
 */
export const INPUT_GROUPS: readonly {
  group: string;
  features: readonly FeatureName[];
}[] = [
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
  {
    group: "quarterback efficiency",
    features: ["home_qb_efficiency", "away_qb_efficiency"],
  },
  {
    group: "team efficiency",
    features: ["home_offense_epa", "away_offense_epa", "home_defense_epa", "away_defense_epa"],
  },
  { group: "pace", features: ["pace_seconds", "pass_rate_over_expected"] },
  {
    group: "situational",
    features: ["rest_differential", "short_week", "off_bye"],
  },
  {
    group: "efficiency split",
    features: [
      "home_offense_pass_epa",
      "away_offense_pass_epa",
      "home_offense_rush_epa",
      "away_offense_rush_epa",
      "home_defense_pass_epa",
      "away_defense_pass_epa",
      "home_defense_rush_epa",
      "away_defense_rush_epa",
    ],
  },
  {
    group: "efficiency quality",
    features: [
      "home_offense_success",
      "away_offense_success",
      "home_defense_success",
      "away_defense_success",
      "home_offense_early_epa",
      "away_offense_early_epa",
      "home_defense_early_epa",
      "away_defense_early_epa",
      "home_offense_explosive",
      "away_offense_explosive",
      "home_defense_explosive",
      "away_defense_explosive",
    ],
  },
  { group: "turnover margin", features: ["home_turnover_margin", "away_turnover_margin"] },
  {
    group: "travel",
    features: ["home_travel_km", "away_travel_km", "home_zones_crossed", "away_zones_crossed"],
  },
  {
    group: "venue",
    features: ["international", "venue_elevation_km", "closed_roof", "turf"],
  },
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
  /** Replacement level for the quarterback efficiency rating, in EPA per dropback. */
  qbEfficiencyReplacement: number;
  /** Percentage points of completion over expected worth one EPA per dropback. */
  qbCpoeScale: number;
  /** Dropbacks that earn a quarterback's game full weight in the efficiency rating. */
  qbFullDropbacks: number;
  /** Share of the opponent's rating on the other side that is removed from each game's number. */
  opponentAdjustment: number;
  /** Games of zero turnover margin every team starts with, so turnover luck regresses. */
  turnoverRegression: number;
  /**
   * Input groups the ablation did not keep. Their features are held at 0, so the fit gives them
   * no weight. See docs/research/model-evaluation.md for the evidence behind each.
   */
  excludedGroups: readonly string[];
};

// Chosen by validation RMSE on 2017-2021 margins, fit through 2016. See docs/research/model-evaluation.md.
export const DEFAULT_FEATURES: FeatureParameters = {
  gameDecay: 0.94,
  seasonCarry: 0.5,
  priorWeight: 2,
  qbDecay: 0.97,
  qbPriorWeight: 4,
  qbReplacement: -3,
  qbEfficiencyReplacement: -0.1,
  qbCpoeScale: 20,
  qbFullDropbacks: 20,
  opponentAdjustment: 1,
  turnoverRegression: 12,
  // Ablation on 2022-2025 (docs/research/model-evaluation.md): none of these improved held-out log
  // loss clearly, and fitting without them improved every market.
  excludedGroups: [
    "quarterback efficiency",
    "pace",
    "situational",
    "turnover margin",
    "travel",
    "venue",
  ],
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
  /** Recency-weighted opponent-adjusted rates, each with the weight of the games it covers. */
  rates: Record<RateName, { sum: number; weight: number }>;
  /** Takeaways minus giveaways, and the games they cover. */
  turnoverSum: number;
  turnoverWeight: number;
  secondsPerPlay: number;
  passOverExpected: number;
  efficiencyWeight: number;
};

/** o_ is what the offense gained, d_ is what the defense prevented. Higher is better for both. */
const RATE_NAMES = [
  "o_epa",
  "d_epa",
  "o_pass",
  "d_pass",
  "o_rush",
  "d_rush",
  "o_success",
  "d_success",
  "o_early",
  "d_early",
  "o_explosive",
  "d_explosive",
] as const;
type RateName = (typeof RATE_NAMES)[number];

/** A unit's number is read against the other side's rating: an offense against a defense. */
function counterpart(name: RateName): RateName {
  return (name.startsWith("o_") ? `d_${name.slice(2)}` : `o_${name.slice(2)}`) as RateName;
}

function emptyRates(): TeamState["rates"] {
  return Object.fromEntries(
    RATE_NAMES.map((name) => [name, { sum: 0, weight: 0 }]),
  ) as TeamState["rates"];
}

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
    rates: emptyRates(),
    turnoverSum: 0,
    turnoverWeight: 0,
    secondsPerPlay: 0,
    passOverExpected: 0,
    efficiencyWeight: 0,
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

type QbState = {
  weight: number;
  marginSum: number;
  efficiencyWeight: number;
  efficiencySum: number;
};

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
  state.efficiencyWeight *= factor;
  for (const name of RATE_NAMES) {
    state.rates[name].sum *= factor;
    state.rates[name].weight *= factor;
  }
  state.turnoverSum *= factor;
  state.turnoverWeight *= factor;
  state.secondsPerPlay *= factor;
  state.passOverExpected *= factor;
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

function ratesOf(
  offenseEpa: number,
  defenseEpa: number,
  detail: { offense: UnitRates; defense: UnitRates } | undefined,
): Partial<Record<RateName, number | null>> {
  return {
    o_epa: offenseEpa,
    d_epa: defenseEpa,
    o_pass: detail?.offense.passEpa,
    d_pass: detail?.defense.passEpa,
    o_rush: detail?.offense.rushEpa,
    d_rush: detail?.defense.rushEpa,
    o_success: detail?.offense.success,
    d_success: detail?.defense.success,
    o_early: detail?.offense.earlyDownEpa,
    d_early: detail?.defense.earlyDownEpa,
    o_explosive: detail?.offense.explosive,
    d_explosive: detail?.defense.explosive,
  };
}

const NATURAL_SURFACES = new Set(["grass"]);
const CLOSED_ROOFS = new Set(["dome", "closed"]);

/**
 * Travel, time zones, altitude, an international site, roof, and surface. All of it comes from
 * the schedule and the stadium table. An unknown stadium reads as an ordinary home game, not a
 * guess. A neutral or international site is not a home game: the designated home club travels
 * from its own base too.
 */
function venueFeatures(game: UpcomingGame) {
  const site = venueOf(game.venue?.stadiumId);
  const travel = (baseId: string | undefined) => {
    const base = venueOf(baseId);
    return site && base
      ? { km: distanceKm(base, site) / 1000, zones: zonesCrossed(base, site) }
      : { km: 0, zones: 0 };
  };
  const home = travel(game.venue?.homeBaseId);
  const away = travel(game.venue?.awayBaseId);
  const surface = game.venue?.surface ?? "";
  return {
    home_travel_km: home.km,
    away_travel_km: away.km,
    home_zones_crossed: home.zones,
    away_zones_crossed: away.zones,
    international: site?.international ? 1 : 0,
    venue_elevation_km: (site?.elevationM ?? 0) / 1000,
    closed_roof: CLOSED_ROOFS.has(game.venue?.roof ?? "") ? 1 : 0,
    turf: surface === "" || NATURAL_SURFACES.has(surface) ? 0 : 1,
  };
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
  /** League-wide raw average of each rate, the level a team with no games is assumed to have. */
  const league = Object.fromEntries(
    RATE_NAMES.map((name) => [name, { sum: 0, count: 0 }]),
  ) as Record<RateName, { sum: number; count: number }>;
  const leagueMean = (name: RateName) =>
    league[name].count === 0 ? 0 : league[name].sum / league[name].count;
  const rateOf = (state: TeamState, name: RateName) => {
    const { sum, weight } = state.rates[name];
    return (sum + params.priorWeight * leagueMean(name)) / (weight + params.priorWeight);
  };
  const turnoverMargin = (state: TeamState) =>
    state.turnoverSum / (state.turnoverWeight + params.turnoverRegression);
  const pace = (state: TeamState) =>
    state.efficiencyWeight === 0 ? 0 : state.secondsPerPlay / state.efficiencyWeight;
  const passRate = (state: TeamState) =>
    state.efficiencyWeight === 0 ? 0 : state.passOverExpected / state.efficiencyWeight;
  const efficiencyRating = (qb: string | undefined) => {
    const state = qb === undefined ? undefined : quarterbacks.get(qb);
    const weight = (state?.efficiencyWeight ?? 0) + params.qbPriorWeight;
    if (weight === 0) return params.qbEfficiencyReplacement;
    return (
      ((state?.efficiencySum ?? 0) + params.qbPriorWeight * params.qbEfficiencyReplacement) / weight
    );
  };
  const recordRating = (qb: string | undefined, margin: number) => {
    if (qb === undefined) return;
    const state = quarterbacks.get(qb) ?? {
      weight: 0,
      marginSum: 0,
      efficiencyWeight: 0,
      efficiencySum: 0,
    };
    state.weight = state.weight * params.qbDecay + 1;
    state.marginSum = state.marginSum * params.qbDecay + margin;
    quarterbacks.set(qb, state);
  };
  /** EPA per dropback plus completion over expected, weighted by how much the quarterback played. */
  const recordQbEfficiency = (
    qb: string | undefined,
    epa: number | null,
    cpoe: number | null | undefined,
    dropbacks: number | undefined,
  ) => {
    if (qb === undefined || epa === null) return;
    const value = epa + (cpoe ?? 0) / params.qbCpoeScale;
    const share = dropbacks === undefined ? 1 : Math.min(1, dropbacks / params.qbFullDropbacks);
    const state = quarterbacks.get(qb) ?? {
      weight: 0,
      marginSum: 0,
      efficiencyWeight: 0,
      efficiencySum: 0,
    };
    state.efficiencyWeight = state.efficiencyWeight * params.qbDecay + share;
    state.efficiencySum = state.efficiencySum * params.qbDecay + share * value;
    quarterbacks.set(qb, state);
  };
  /** Pace and pass rate over expected do not depend on the opponent. */
  const recordPace = (state: TeamState, seconds: number | null, passOver: number | null) => {
    state.efficiencyWeight += 1;
    state.secondsPerPlay += seconds ?? 0;
    state.passOverExpected += passOver ?? 0;
  };
  /** Each game's number, less what the opponent's rating on the other side already predicts. */
  const adjustedRates = (
    own: Partial<Record<RateName, number | null>>,
    opponent: TeamState,
  ): Partial<Record<RateName, number>> => {
    const out: Partial<Record<RateName, number>> = {};
    for (const name of RATE_NAMES) {
      const value = own[name];
      if (value === null || value === undefined) continue;
      const other = counterpart(name);
      out[name] = value + params.opponentAdjustment * (rateOf(opponent, other) - leagueMean(other));
    }
    return out;
  };
  const recordRates = (state: TeamState, values: Partial<Record<RateName, number>>) => {
    for (const name of RATE_NAMES) {
      const value = values[name];
      if (value === undefined) continue;
      state.rates[name].sum += value;
      state.rates[name].weight += 1;
    }
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
      const excluded = new Set<string>(
        INPUT_GROUPS.filter((group) => params.excludedGroups.includes(group.group)).flatMap(
          (group) => group.features,
        ),
      );
      const measured = {
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
        home_qb_efficiency: efficiencyRating(game.homeQb),
        away_qb_efficiency: efficiencyRating(game.awayQb),
        home_offense_epa: rateOf(home, "o_epa"),
        away_offense_epa: rateOf(away, "o_epa"),
        home_defense_epa: rateOf(home, "d_epa"),
        away_defense_epa: rateOf(away, "d_epa"),
        home_offense_pass_epa: rateOf(home, "o_pass"),
        away_offense_pass_epa: rateOf(away, "o_pass"),
        home_offense_rush_epa: rateOf(home, "o_rush"),
        away_offense_rush_epa: rateOf(away, "o_rush"),
        home_defense_pass_epa: rateOf(home, "d_pass"),
        away_defense_pass_epa: rateOf(away, "d_pass"),
        home_defense_rush_epa: rateOf(home, "d_rush"),
        away_defense_rush_epa: rateOf(away, "d_rush"),
        home_offense_success: rateOf(home, "o_success"),
        away_offense_success: rateOf(away, "o_success"),
        home_defense_success: rateOf(home, "d_success"),
        away_defense_success: rateOf(away, "d_success"),
        home_offense_early_epa: rateOf(home, "o_early"),
        away_offense_early_epa: rateOf(away, "o_early"),
        home_defense_early_epa: rateOf(home, "d_early"),
        away_defense_early_epa: rateOf(away, "d_early"),
        home_offense_explosive: rateOf(home, "o_explosive"),
        away_offense_explosive: rateOf(away, "o_explosive"),
        home_defense_explosive: rateOf(home, "d_explosive"),
        away_defense_explosive: rateOf(away, "d_explosive"),
        home_turnover_margin: turnoverMargin(home),
        away_turnover_margin: turnoverMargin(away),
        ...venueFeatures(game),
        pace_seconds: pace(home) + pace(away),
        pass_rate_over_expected: passRate(home) + passRate(away),
        rest_differential: restDays(home, at) - restDays(away, at),
        short_week: restDays(home, at) < 6 || restDays(away, at) < 6 ? 1 : 0,
        off_bye: restDays(home, at) >= 13 || restDays(away, at) >= 13 ? 1 : 0,
      };
      return {
        gameId: game.id,
        kickoff: game.kickoff,
        ...(game.resultAvailableAt ? { resultAvailableAt: game.resultAvailableAt } : {}),
        features: Object.fromEntries(
          Object.entries(measured).map(([name, value]) => [name, excluded.has(name) ? 0 : value]),
        ) as Record<FeatureName, number>,
      };
    },
    apply(game: CompletedGame): void {
      const home = stateOf(game.home);
      const away = stateOf(game.away);
      const at = kickoffMs(game);
      enterSeason(home, seasonOf(game), params);
      enterSeason(away, seasonOf(game), params);
      // Each side's number is read against the opponent's rating as it stood before this game.
      const homeRaw = game.efficiency
        ? ratesOf(
            game.efficiency.homeOffenseEpa,
            game.efficiency.homeDefenseEpa,
            game.efficiency.home,
          )
        : {};
      const awayRaw = game.efficiency
        ? ratesOf(
            game.efficiency.awayOffenseEpa,
            game.efficiency.awayDefenseEpa,
            game.efficiency.away,
          )
        : {};
      const homeAdjusted = adjustedRates(homeRaw, away);
      const awayAdjusted = adjustedRates(awayRaw, home);
      applyGame(home, game.homeScore, game.awayScore, at, params);
      applyGame(away, game.awayScore, game.homeScore, at, params);
      recordStarter(home, game.homeQb);
      recordStarter(away, game.awayQb);
      recordRating(game.homeQb, game.homeScore - game.awayScore);
      recordRating(game.awayQb, game.awayScore - game.homeScore);
      if (game.efficiency) {
        const detail = game.efficiency;
        recordRates(home, homeAdjusted);
        recordRates(away, awayAdjusted);
        for (const raw of [homeRaw, awayRaw]) {
          for (const name of RATE_NAMES) {
            const value = raw[name];
            if (value === null || value === undefined) continue;
            league[name].sum += value;
            league[name].count += 1;
          }
        }
        recordPace(home, detail.homeSecondsPerPlay, detail.homePassOverExpected);
        recordPace(away, detail.awaySecondsPerPlay, detail.awayPassOverExpected);
        recordQbEfficiency(
          game.homeQb,
          detail.homeQbEpa,
          detail.homeQbCpoe,
          detail.homeQbDropbacks,
        );
        recordQbEfficiency(
          game.awayQb,
          detail.awayQbEpa,
          detail.awayQbCpoe,
          detail.awayQbDropbacks,
        );
        if (detail.home && detail.away) {
          const margin = detail.away.giveaways - detail.home.giveaways;
          home.turnoverSum += margin;
          home.turnoverWeight += 1;
          away.turnoverSum -= margin;
          away.turnoverWeight += 1;
        }
      }
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
