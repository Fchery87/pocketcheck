import { existsSync, readFileSync } from "node:fs";
import { parseCsv } from "./nflverse.ts";

/**
 * Compact per-game team numbers derived from nflverse play-by-play. The season file stays on
 * disk. Only this summary is small enough to keep.
 */
export type TeamGameSummary = {
  gameId: string;
  season: number;
  week: number;
  team: string;
  opponent: string;
  /** Plays the team ran on offense. The denominator for the offensive rates. */
  offensivePlays: number;
  /** Plays the team faced on defense. */
  defensivePlays: number;
  offenseEpaPerPlay: number | null;
  defenseEpaPerPlay: number | null;
  passEpaPerPlay: number | null;
  rushEpaPerPlay: number | null;
  /** Share of offensive plays with epa above zero. */
  successRate: number | null;
  earlyDownEpaPerPlay: number | null;
  /** Share of offensive plays gaining at least 20 yards. */
  explosiveRate: number | null;
  /** Seconds between the team's offensive snaps. Null when the file has no snap times. */
  secondsPerPlay: number | null;
  passRateOverExpected: number | null;
  turnovers: number;
  /** Fumbles the defense recovered. Kept apart from turnovers so luck can be discounted. */
  fumbleRecoveries: number;
};

export type PlayByPlayRead = {
  summaries: TeamGameSummary[];
  gaps: string[];
};

const REQUIRED = ["game_id", "posteam", "defteam", "play_type", "epa", "season", "week"] as const;

export const PLAY_BY_PLAY_LICENSE = {
  name: "CC BY 4.0",
  attribution: "nflverse",
  url: "https://github.com/nflverse/nflverse-data",
} as const;

const EXPLOSIVE_YARDS = 20;

/** One season file becomes one summary per team per game. A bad file is a gap, not a guess. */
export function teamSummariesFromPlayByPlay(csv: string): PlayByPlayRead {
  if (csv.trim() === "") return { summaries: [], gaps: ["Play-by-play file is empty."] };
  const rows = parseCsv(csv);
  if (rows.length === 0) return { summaries: [], gaps: ["Play-by-play file has no plays."] };
  const header = new Set(Object.keys(rows[0] ?? {}));
  const missing = REQUIRED.filter((column) => !header.has(column));
  if (missing.length > 0) {
    return {
      summaries: [],
      gaps: [`Play-by-play file is missing ${missing.join(", ")}.`],
    };
  }
  const games = new Map<string, Map<string, Play[]>>();
  for (const row of rows) {
    const gameId = row.game_id ?? "";
    const team = row.posteam ?? "";
    if (gameId === "" || team === "") continue;
    const byTeam = games.get(gameId) ?? new Map<string, Play[]>();
    const plays = byTeam.get(team) ?? [];
    plays.push(playOf(row));
    byTeam.set(team, plays);
    games.set(gameId, byTeam);
  }
  const summaries: TeamGameSummary[] = [];
  for (const [gameId, byTeam] of games) {
    for (const [team, plays] of byTeam) {
      const opponent = plays.find((play) => play.defense !== "")?.defense ?? "";
      const faced = [...byTeam.values()].flat().filter((play) => play.defense === team);
      summaries.push(summarize(gameId, team, opponent, plays, faced));
    }
  }
  return {
    summaries: summaries.sort(
      (a, b) => a.gameId.localeCompare(b.gameId) || a.team.localeCompare(b.team),
    ),
    gaps: summaries.length === 0 ? ["Play-by-play file has no offensive plays."] : [],
  };
}

/**
 * Reads one file per season. A missing or unreadable season is a gap for that season only.
 * The other seasons still produce summaries.
 */
export function teamSummariesFromSeasonFiles(
  files: readonly { season: number; path: string }[],
): PlayByPlayRead {
  const summaries: TeamGameSummary[] = [];
  const gaps: string[] = [];
  for (const file of files) {
    if (!existsSync(file.path)) {
      gaps.push(`Play-by-play for ${file.season} is missing.`);
      continue;
    }
    let text = "";
    try {
      text = readFileSync(file.path, "utf8");
    } catch {
      gaps.push(`Play-by-play for ${file.season} could not be read.`);
      continue;
    }
    const read = teamSummariesFromPlayByPlay(text);
    if (read.gaps.length > 0) {
      gaps.push(...read.gaps.map((gap) => `${file.season}: ${gap}`));
      continue;
    }
    summaries.push(...read.summaries);
  }
  return { summaries, gaps };
}

type Play = {
  season: number;
  week: number;
  defense: string;
  kind: "pass" | "rush" | "other";
  epa: number | null;
  down: number | null;
  yards: number | null;
  seconds: number | null;
  passOverExpected: number | null;
  turnover: boolean;
  fumbleLost: boolean;
};

function playOf(row: Record<string, string>): Play {
  const kind = row.play_type === "pass" ? "pass" : row.play_type === "run" ? "rush" : "other";
  return {
    season: Number(row.season),
    week: Number(row.week),
    defense: row.defteam ?? "",
    kind,
    epa: finite(row.epa),
    down: finite(row.down),
    yards: finite(row.yards_gained),
    seconds: finite(row.time_to_throw ?? row.game_seconds_remaining),
    passOverExpected: finite(row.pass_oe),
    turnover: row.interception === "1" || row.fumble_lost === "1",
    fumbleLost: row.fumble_lost === "1",
  };
}

function summarize(
  gameId: string,
  team: string,
  opponent: string,
  offense: readonly Play[],
  defense: readonly Play[],
): TeamGameSummary {
  const rated = offense.filter((play) => play.epa !== null);
  const passes = rated.filter((play) => play.kind === "pass");
  const rushes = rated.filter((play) => play.kind === "rush");
  const early = rated.filter((play) => play.down === 1 || play.down === 2);
  const faced = defense.filter((play) => play.epa !== null);
  const first = offense[0];
  return {
    gameId,
    season: first?.season ?? 0,
    week: first?.week ?? 0,
    team,
    opponent,
    offensivePlays: offense.length,
    defensivePlays: defense.length,
    offenseEpaPerPlay: perPlay(rated),
    defenseEpaPerPlay: perPlay(faced) === null ? null : -(perPlay(faced) as number),
    passEpaPerPlay: perPlay(passes),
    rushEpaPerPlay: perPlay(rushes),
    successRate:
      rated.length === 0 ? null : rated.filter((play) => (play.epa ?? 0) > 0).length / rated.length,
    earlyDownEpaPerPlay: perPlay(early),
    explosiveRate:
      offense.length === 0
        ? null
        : offense.filter((play) => (play.yards ?? 0) >= EXPLOSIVE_YARDS).length / offense.length,
    secondsPerPlay: average(
      offense.flatMap((play) => (play.seconds === null ? [] : [play.seconds])),
    ),
    passRateOverExpected: average(
      passes.flatMap((play) => (play.passOverExpected === null ? [] : [play.passOverExpected])),
    ),
    turnovers: offense.filter((play) => play.turnover).length,
    fumbleRecoveries: defense.filter((play) => play.fumbleLost).length,
  };
}

function perPlay(plays: readonly Play[]): number | null {
  const rated = plays.filter((play) => play.epa !== null);
  if (rated.length === 0) return null;
  return rated.reduce((sum, play) => sum + (play.epa ?? 0), 0) / rated.length;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function finite(value: string | undefined): number | null {
  if (value === undefined || value === "" || value.toUpperCase() === "NA") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
