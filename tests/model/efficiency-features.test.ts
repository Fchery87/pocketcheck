import { describe, expect, it } from "vite-plus/test";
import {
  buildFeatureRows,
  DEFAULT_FEATURES,
  type FeatureParameters,
} from "../../src/lib/server/models/features.ts";
import { attachEfficiency } from "../../src/lib/server/models/efficiency-join.ts";
import type { CompletedGame, SideRates, UnitRates } from "../../src/lib/server/models/games.ts";
import { teamSummariesFromPlayByPlay } from "../../src/lib/server/sources/play-by-play.ts";

const NONE: UnitRates = {
  passEpa: null,
  rushEpa: null,
  success: null,
  earlyDownEpa: null,
  explosive: null,
};
const side = (offense: Partial<UnitRates> = {}, defense: Partial<UnitRates> = {}): SideRates => ({
  offense: { ...NONE, ...offense },
  defense: { ...NONE, ...defense },
  giveaways: 0,
  fumblesRecovered: 0,
});

type Options = Partial<CompletedGame> & {
  homeEpa?: number;
  awayEpa?: number;
  homeDef?: number;
  awayDef?: number;
};

let counter = 0;
function played(day: number, home: string, away: string, options: Options = {}): CompletedGame {
  const { homeEpa = 0, awayEpa = 0, homeDef = 0, awayDef = 0, ...rest } = options;
  counter += 1;
  return {
    id: `g${counter}`,
    season: 2024,
    kickoff: `2024-09-${String(day).padStart(2, "0")}T17:00:00Z`,
    home,
    away,
    homeScore: 20,
    awayScore: 17,
    efficiency: {
      homeOffenseEpa: homeEpa,
      awayOffenseEpa: awayEpa,
      homeDefenseEpa: homeDef,
      awayDefenseEpa: awayDef,
      homeSecondsPerPlay: null,
      awaySecondsPerPlay: null,
      homePassOverExpected: null,
      awayPassOverExpected: null,
      homeQbEpa: null,
      awayQbEpa: null,
      home: side(),
      away: side(),
    },
    ...rest,
  };
}

const params = (over: Partial<FeatureParameters> = {}): FeatureParameters => ({
  ...DEFAULT_FEATURES,
  gameDecay: 1,
  excludedGroups: [],
  priorWeight: 1,
  ...over,
});

const upcoming = (day: number, home: string, away: string, over: Partial<CompletedGame> = {}) =>
  played(day, home, away, { homeScore: 0, awayScore: 0, ...over });

function rowOf(games: CompletedGame[], id: string, over: Partial<FeatureParameters> = {}) {
  return buildFeatureRows(games, params(over)).find((row) => row.gameId === id)!.features;
}

describe("team efficiency ratings", () => {
  it("never lets a later result change an earlier row", () => {
    const early = played(1, "A", "B", { homeEpa: 0.2 });
    const probe = upcoming(10, "A", "C");
    const before = rowOf([early, probe], probe.id);
    const after = rowOf(
      [early, probe, played(20, "A", "D", { homeEpa: 0.9, homeDef: 0.9 })],
      probe.id,
    );
    expect(after).toEqual(before);
  });

  it("rates a team above one with no games once its offense proves efficient", () => {
    const games = [played(1, "A", "X", { homeEpa: 0.3 }), played(8, "B", "Y", { homeEpa: 0 })];
    const probe = upcoming(15, "A", "B");
    const features = rowOf([...games, probe], probe.id);
    expect(features.home_offense_epa).toBeGreaterThan(features.away_offense_epa);
  });

  it("removes what the opponent's defense already explains", () => {
    // B's defense is strong (+0.2 prevented). A's 0.1 against it is better than the raw 0.1.
    const setup = [played(1, "B", "X", { homeEpa: 0, homeDef: 0.2 })];
    const against = played(8, "A", "B", { homeEpa: 0.1 });
    const probe = upcoming(15, "A", "C");
    const adjusted = rowOf([...setup, against, probe], probe.id, { opponentAdjustment: 1 });
    const raw = rowOf([...setup, against, probe], probe.id, { opponentAdjustment: 0 });
    expect(adjusted.home_offense_epa).toBeGreaterThan(raw.home_offense_epa);
  });

  it("carries last season's rating into the next at the seasonCarry weight", () => {
    const old = played(1, "A", "X", { homeEpa: 0.4 });
    const nextSeason = upcoming(2, "A", "B", { season: 2025, kickoff: "2025-09-02T17:00:00Z" });
    const full = rowOf([old, nextSeason], nextSeason.id, { seasonCarry: 1 });
    const half = rowOf([old, nextSeason], nextSeason.id, { seasonCarry: 0.5 });
    expect(full.home_offense_epa).toBeGreaterThan(half.home_offense_epa);
    expect(half.home_offense_epa).toBeGreaterThan(0);
  });

  it("splits passing, rushing, success, early downs, and explosive plays", () => {
    const game = played(1, "A", "X", {
      efficiency: {
        ...played(1, "A", "X").efficiency!,
        home: side(
          { passEpa: 0.2, rushEpa: -0.1, success: 0.5, earlyDownEpa: 0.05, explosive: 0.1 },
          { passEpa: 0.1 },
        ),
      },
    });
    // A second club pulls the league average away from A's numbers.
    const other = played(2, "C", "Y", {
      efficiency: {
        ...played(2, "C", "Y").efficiency!,
        home: side(
          { passEpa: 0, rushEpa: 0.1, success: 0.4, earlyDownEpa: 0, explosive: 0.05 },
          { passEpa: 0 },
        ),
      },
    });
    const probe = upcoming(8, "A", "B");
    const features = rowOf([game, other, probe], probe.id);
    expect(features.home_offense_pass_epa).toBeGreaterThan(features.away_offense_pass_epa);
    expect(features.home_offense_rush_epa).toBeLessThan(features.away_offense_rush_epa);
    expect(features.home_offense_success).toBeGreaterThan(features.away_offense_success);
    expect(features.home_defense_pass_epa).toBeGreaterThan(features.away_defense_pass_epa);
  });

  it("regresses turnover margin toward zero", () => {
    const lucky = played(1, "A", "X", {
      efficiency: {
        ...played(1, "A", "X").efficiency!,
        home: { ...side(), giveaways: 0 },
        away: { ...side(), giveaways: 4 },
      },
    });
    const probe = upcoming(8, "A", "B");
    const loose = rowOf([lucky, probe], probe.id, { turnoverRegression: 1 });
    const regressed = rowOf([lucky, probe], probe.id, { turnoverRegression: 12 });
    expect(loose.home_turnover_margin).toBeGreaterThan(regressed.home_turnover_margin);
    expect(regressed.home_turnover_margin).toBeGreaterThan(0);
  });
});

describe("quarterback efficiency rating", () => {
  const throwing = (day: number, qb: string, epa: number, cpoe: number, dropbacks = 30) =>
    played(day, "A", `X${day}`, {
      homeQb: qb,
      efficiency: {
        ...played(day, "A", "X").efficiency!,
        homeQbEpa: epa,
        homeQbCpoe: cpoe,
        homeQbDropbacks: dropbacks,
      },
    });
  const options = { qbDecay: 1, qbPriorWeight: 2, qbEfficiencyReplacement: -0.1, qbCpoeScale: 20 };

  it("shrinks a quarterback's EPA per dropback toward the replacement level", () => {
    const probe = upcoming(20, "A", "B", { homeQb: "q" });
    const features = rowOf(
      [throwing(1, "q", 0.3, 0), throwing(8, "q", 0.3, 0), probe],
      probe.id,
      options,
    );
    // (0.3 + 0.3 + 2 * -0.1) / 4
    expect(features.home_qb_efficiency).toBeCloseTo(0.1, 10);
  });

  it("adds completion over expected at the cpoe scale", () => {
    const probe = upcoming(20, "A", "B", { homeQb: "q" });
    const features = rowOf([throwing(1, "q", 0.1, 4), probe], probe.id, options);
    // (0.1 + 4 / 20 + 2 * -0.1) / 3
    expect(features.home_qb_efficiency).toBeCloseTo(0.1 / 3, 10);
  });

  it("counts a short relief appearance for less", () => {
    const probe = upcoming(20, "A", "B", { homeQb: "q" });
    const starter = rowOf([throwing(1, "q", 0.4, 0, 40), probe], probe.id, options);
    const relief = rowOf([throwing(1, "q", 0.4, 0, 4), probe], probe.id, options);
    expect(starter.home_qb_efficiency).toBeGreaterThan(relief.home_qb_efficiency);
  });

  it("uses the backup's own rating, replacement level with no starts", () => {
    const probe = upcoming(20, "A", "B", { homeQb: "backup" });
    const features = rowOf([throwing(1, "q", 0.4, 0), probe], probe.id, options);
    expect(features.home_qb_efficiency).toBeCloseTo(-0.1, 10);
  });

  it("uses only plays from games available before the cutoff", () => {
    const probe = upcoming(20, "A", "B", { homeQb: "q" });
    const before = rowOf([throwing(1, "q", 0.3, 0), probe], probe.id, options);
    const after = rowOf(
      [throwing(1, "q", 0.3, 0), probe, throwing(30, "q", 0.9, 9)],
      probe.id,
      options,
    );
    expect(after.home_qb_efficiency).toBe(before.home_qb_efficiency);
  });
});

describe("situational inputs", () => {
  const venue = (stadiumId: string, extra: Partial<NonNullable<CompletedGame["venue"]>> = {}) => ({
    stadiumId,
    roof: "outdoors",
    surface: "grass",
    ...extra,
  });
  const featuresOf = (game: CompletedGame) => rowOf([game], game.id);

  it("measures a trip from the club's own stadium and the zones it crosses", () => {
    const features = featuresOf(
      upcoming(8, "SEA", "NYJ", {
        venue: venue("SEA00", { homeBaseId: "SEA00", awayBaseId: "NYC01" }),
      }),
    );
    expect(features.home_travel_km).toBe(0);
    expect(features.home_zones_crossed).toBe(0);
    expect(features.away_travel_km).toBeGreaterThan(3.5);
    expect(features.away_zones_crossed).toBe(3);
  });

  it("does not treat a neutral or international stadium as a home game", () => {
    const features = featuresOf(
      upcoming(8, "JAX", "CHI", {
        neutral: true,
        venue: venue("LON00", { homeBaseId: "JAX00", awayBaseId: "CHI98" }),
      }),
    );
    expect(features.home_indicator).toBe(0);
    expect(features.international).toBe(1);
    expect(features.home_travel_km).toBeGreaterThan(6);
    expect(features.away_travel_km).toBeGreaterThan(6);
  });

  it("reads altitude, roof, and surface from the stadium", () => {
    const denver = featuresOf(upcoming(8, "DEN", "KC", { venue: venue("DEN00") }));
    expect(denver.venue_elevation_km).toBeCloseTo(1.609, 3);
    expect(denver.closed_roof).toBe(0);
    expect(denver.turf).toBe(0);
    const dome = featuresOf(
      upcoming(8, "MIN", "GB", { venue: venue("MIN01", { roof: "dome", surface: "fieldturf" }) }),
    );
    expect(dome.closed_roof).toBe(1);
    expect(dome.turf).toBe(1);
  });

  it("reads an unknown stadium as no information, not as a trip", () => {
    const features = featuresOf(upcoming(8, "A", "B", { venue: venue("ZZZ99") }));
    expect(features).toMatchObject({
      home_travel_km: 0,
      away_travel_km: 0,
      international: 0,
      venue_elevation_km: 0,
    });
  });
});

describe("play-by-play join", () => {
  const header =
    "game_id,season,week,posteam,defteam,play_type,epa,down,yards_gained,drive,play_id,game_seconds_remaining,qb_dropback,passer_player_id,cpoe,pass_oe,interception,fumble_lost";
  const csv = [
    header,
    "G1,2024,1,AAA,BBB,pass,0.5,1,25,1,10,3600,1,qa,3,1,0,0",
    "G1,2024,1,AAA,BBB,run,0.1,2,4,1,20,3570,0,,,,0,0",
    "G1,2024,1,AAA,BBB,pass,-0.2,3,0,1,30,3535,1,qa,-1,2,1,0",
    "G1,2024,1,BBB,AAA,pass,0.2,1,8,2,40,3400,1,qb,1,0,0,0",
    "G1,2024,1,BBB,AAA,run,-0.1,2,2,2,50,3370,0,,,,0,1",
  ].join("\n");
  const read = teamSummariesFromPlayByPlay(csv);

  it("summarizes dropbacks with EPA and completion over expected", () => {
    expect(read.quarterbacks.find((line) => line.playerId === "qa")).toMatchObject({
      dropbacks: 2,
      epaPerDropback: 0.15,
      cpoe: 1,
    });
  });

  it("measures tempo as the clock between snaps of one drive", () => {
    const team = read.summaries.find((line) => line.team === "AAA");
    expect(team?.secondsPerPlay).toBeCloseTo((30 + 35) / 2, 10);
  });

  it("attaches both sides, defense as what the opponent was held to", () => {
    const [game] = attachEfficiency(
      [{ ...played(1, "AAA", "BBB"), id: "G1", efficiency: undefined, homeQb: "qa", awayQb: "qb" }],
      read,
    );
    const detail = game!.efficiency!;
    expect(detail.homeOffenseEpa).toBeCloseTo(0.4 / 3, 10);
    expect(detail.homeDefenseEpa).toBeCloseTo(-0.05, 10);
    expect(detail.homeQbEpa).toBeCloseTo(0.15, 10);
    expect(detail.home?.defense.passEpa).toBeCloseTo(-0.2, 10);
    expect(detail.home?.giveaways).toBe(1);
    expect(detail.home?.fumblesRecovered).toBe(1);
  });

  it("leaves a game without plays for both sides alone", () => {
    const lone = { ...played(1, "AAA", "ZZZ"), id: "G9", efficiency: undefined };
    expect(attachEfficiency([lone], read)[0]).toBe(lone);
  });
});

describe("excluded input groups", () => {
  it("holds an excluded group's features at zero so the fit gives them no weight", () => {
    const probe = upcoming(8, "SEA", "NYJ", {
      venue: { stadiumId: "SEA00", roof: "outdoors", surface: "fieldturf", awayBaseId: "NYC01" },
    });
    const kept = rowOf([probe], probe.id, { excludedGroups: [] });
    const dropped = rowOf([probe], probe.id, { excludedGroups: ["travel", "venue"] });
    expect(kept.away_travel_km).toBeGreaterThan(0);
    expect(kept.turf).toBe(1);
    expect(dropped.away_travel_km).toBe(0);
    expect(dropped.turf).toBe(0);
    expect(dropped.home_prior_margin).toBe(kept.home_prior_margin);
  });
});
