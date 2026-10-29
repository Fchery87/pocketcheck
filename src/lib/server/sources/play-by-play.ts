import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
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

/** One passer's dropbacks in one game. Backups who only relieve show up with few dropbacks. */
export type QuarterbackGameSummary = {
  gameId: string;
  team: string;
  playerId: string;
  dropbacks: number;
  epaPerDropback: number | null;
  /** Completion percentage over expected, in percentage points, over passes that have one. */
  cpoe: number | null;
};

export type PlayByPlayRead = {
  summaries: TeamGameSummary[];
  quarterbacks: QuarterbackGameSummary[];
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
  if (csv.trim() === "")
    return { summaries: [], quarterbacks: [], gaps: ["Play-by-play file is empty."] };
  const rows = parseCsv(csv);
  if (rows.length === 0)
    return { summaries: [], quarterbacks: [], gaps: ["Play-by-play file has no plays."] };
  const header = new Set(Object.keys(rows[0] ?? {}));
  const missing = REQUIRED.filter((column) => !header.has(column));
  if (missing.length > 0) {
    return {
      summaries: [],
      quarterbacks: [],
      gaps: [`Play-by-play file is missing ${missing.join(", ")}.`],
    };
  }
  const games = new Map<string, Map<string, Play[]>>();
  const passers = new Map<
    string,
    QuarterbackGameSummary & {
      epaSum: number;
      epaCount: number;
      cpoeSum: number;
      cpoeCount: number;
    }
  >();
  for (const row of rows) {
    const passer = passerOf(row);
    if (passer && row.game_id && row.posteam) {
      const key = `${row.game_id}|${passer}`;
      const entry = passers.get(key) ?? {
        gameId: row.game_id,
        team: row.posteam,
        playerId: passer,
        dropbacks: 0,
        epaPerDropback: null,
        cpoe: null,
        epaSum: 0,
        epaCount: 0,
        cpoeSum: 0,
        cpoeCount: 0,
      };
      entry.dropbacks += 1;
      const epa = finite(row.epa);
      if (epa !== null) {
        entry.epaSum += epa;
        entry.epaCount += 1;
      }
      const cpoe = finite(row.cpoe);
      if (cpoe !== null) {
        entry.cpoeSum += cpoe;
        entry.cpoeCount += 1;
      }
      passers.set(key, entry);
    }
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
  const quarterbacks = [...passers.values()].map(
    ({ epaSum, epaCount, cpoeSum, cpoeCount, ...entry }): QuarterbackGameSummary => ({
      ...entry,
      epaPerDropback: epaCount === 0 ? null : epaSum / epaCount,
      cpoe: cpoeCount === 0 ? null : cpoeSum / cpoeCount,
    }),
  );
  return {
    summaries: summaries.sort(
      (a, b) => a.gameId.localeCompare(b.gameId) || a.team.localeCompare(b.team),
    ),
    quarterbacks: quarterbacks.sort(
      (a, b) => a.gameId.localeCompare(b.gameId) || a.playerId.localeCompare(b.playerId),
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
  const quarterbacks: QuarterbackGameSummary[] = [];
  const gaps: string[] = [];
  for (const file of files) {
    if (!existsSync(file.path)) {
      gaps.push(`Play-by-play for ${file.season} is missing.`);
      continue;
    }
    const cached = cachedSummaries(file.path);
    if (cached) {
      for (const summary of cached.summaries) summaries.push(summary);
      for (const quarterback of cached.quarterbacks) quarterbacks.push(quarterback);
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
    saveSummaries(file.path, read);
    for (const summary of read.summaries) summaries.push(summary);
    for (const quarterback of read.quarterbacks) quarterbacks.push(quarterback);
  }
  return { summaries, quarterbacks, gaps };
}

type SummaryCache = {
  version: 1;
  sourceSize: number;
  sourceModifiedMs: number;
  summaries: TeamGameSummary[];
  quarterbacks: QuarterbackGameSummary[];
};

// Parsing a season file takes several seconds, so its summary is kept beside it and reused until
// the file changes. A stale or unreadable cache is ignored and rebuilt.
const cachePath = (path: string) => `${path}.summary.json`;

function cachedSummaries(path: string): SummaryCache | null {
  try {
    const source = statSync(path);
    const cache = JSON.parse(readFileSync(cachePath(path), "utf8")) as SummaryCache;
    const current =
      cache.version === 1 &&
      cache.sourceSize === source.size &&
      cache.sourceModifiedMs === source.mtimeMs &&
      Array.isArray(cache.summaries) &&
      Array.isArray(cache.quarterbacks);
    return current ? cache : null;
  } catch {
    return null;
  }
}

function saveSummaries(path: string, read: PlayByPlayRead): void {
  try {
    const source = statSync(path);
    const cache: SummaryCache = {
      version: 1,
      sourceSize: source.size,
      sourceModifiedMs: source.mtimeMs,
      summaries: read.summaries,
      quarterbacks: read.quarterbacks,
    };
    writeFileSync(cachePath(path), JSON.stringify(cache));
  } catch {
    // A cache that cannot be written only costs the next read its speed.
  }
}

type Play = {
  season: number;
  week: number;
  defense: string;
  kind: "pass" | "rush" | "other";
  epa: number | null;
  down: number | null;
  yards: number | null;
  /** Game clock seconds remaining at the snap. */
  clock: number | null;
  drive: number | null;
  playId: number | null;
  passOverExpected: number | null;
  turnover: boolean;
  fumbleLost: boolean;
};

/** The passer on a dropback, or the scrambler. Null for plays that are not dropbacks. */
function passerOf(row: Record<string, string>): string | null {
  if (row.qb_dropback !== "1") return null;
  const id = row.passer_player_id || (row.qb_scramble === "1" ? row.rusher_player_id : "");
  return id ? id : null;
}

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
    clock: finite(row.game_seconds_remaining),
    drive: finite(row.drive),
    playId: finite(row.play_id),
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
    secondsPerPlay: average(snapGaps(offense)),
    passRateOverExpected: average(
      passes.flatMap((play) => (play.passOverExpected === null ? [] : [play.passOverExpected])),
    ),
    turnovers: offense.filter((play) => play.turnover).length,
    fumbleRecoveries: defense.filter((play) => play.fumbleLost).length,
  };
}

/** The longest gap between two snaps of one drive that still reads as tempo, not a stoppage. */
const MAX_SNAP_GAP_SECONDS = 50;

/** Game-clock seconds between consecutive snaps of the same drive. */
function snapGaps(offense: readonly Play[]): number[] {
  const drives = new Map<number, Play[]>();
  for (const play of offense) {
    if (play.drive === null || play.clock === null || play.playId === null) continue;
    const plays = drives.get(play.drive) ?? [];
    plays.push(play);
    drives.set(play.drive, plays);
  }
  const gaps: number[] = [];
  for (const plays of drives.values()) {
    plays.sort((a, b) => a.playId! - b.playId!);
    for (let index = 1; index < plays.length; index += 1) {
      const gap = plays[index - 1]!.clock! - plays[index]!.clock!;
      if (gap > 0 && gap <= MAX_SNAP_GAP_SECONDS) gaps.push(gap);
    }
  }
  return gaps;
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
