import type { RoofState, ScheduledGame, ScheduleSpread } from "./contracts.ts";

type CsvRow = Record<string, string>;

const REQUIRED = [
  "game_id",
  "season",
  "week",
  "gameday",
  "gametime",
  "away_team",
  "home_team",
  "away_score",
  "home_score",
  "spread_line",
  "roof",
  "stadium_id",
  "stadium",
] as const;

export function parseCsv(text: string): CsvRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0] ?? "");
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char ?? "";
    }
  }
  cells.push(current);
  return cells;
}

export function assertNflverseGamesHeader(text: string): void {
  const header = text.replace(/^\uFEFF/, "").split(/\r?\n/)[0] ?? "";
  const columns = new Set(splitCsvLine(header));
  const missing = REQUIRED.filter((column) => !columns.has(column));
  if (missing.length > 0) {
    throw new Error(`schema mismatch: missing ${missing.join(", ")}`);
  }
}

function roofOf(value: string): RoofState {
  if (value === "outdoors" || value === "dome" || value === "closed" || value === "open") {
    return value;
  }
  if (value === "retractable") return "retractable";
  return "unknown";
}

function scorePair(home: string, away: string): ScheduledGame["finalScore"] {
  if (home === "" || away === "") return null;
  const homeScore = Number(home);
  const awayScore = Number(away);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;
  return { home: homeScore, away: awayScore };
}

export function homeLineFromNflverseSpread(spreadLine: number): ScheduleSpread {
  const homeLine = -spreadLine;
  const homeFavored = spreadLine > 0;
  const magnitude = Math.abs(homeLine);
  const signed = homeLine > 0 ? `+${magnitude}` : homeLine < 0 ? `-${magnitude}` : "0";
  return {
    nflverseSpreadLine: spreadLine,
    homeFavored,
    homeLine,
    display: `home ${signed}`,
  };
}

export function easternKickoffUtc(gameday: string, gametime: string): string {
  const [year, month, day] = gameday.split("-").map(Number);
  const [hour, minute] = gametime.split(":").map(Number);
  if (!year || !month || !day || hour === undefined || minute === undefined) {
    throw new Error(`unreadable kickoff ${gameday} ${gametime}`);
  }
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMinutes = newYorkOffsetMinutes(new Date(utcGuess));
  const kickoff = new Date(utcGuess - offsetMinutes * 60_000);
  const refined = newYorkOffsetMinutes(kickoff);
  return new Date(utcGuess - refined * 60_000).toISOString();
}

function newYorkOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

export function scheduleGamesFromCsv(csv: string, input: { retrievedAt: string }): ScheduledGame[] {
  void input.retrievedAt;
  assertNflverseGamesHeader(csv);
  // A row without a kickoff time cannot be checked against a decision cutoff, so it is not offered.
  const timed = parseCsv(csv).filter(
    (row) => (row.gameday ?? "") !== "" && (row.gametime ?? "") !== "",
  );
  return timed.map((row) => {
    const spreadRaw = row.spread_line ?? "";
    const spread = spreadRaw === "" ? null : Number(spreadRaw);
    return {
      id: row.game_id ?? "",
      season: Number(row.season),
      week: Number(row.week),
      home: row.home_team ?? "",
      away: row.away_team ?? "",
      kickoff: easternKickoffUtc(row.gameday ?? "", row.gametime ?? ""),
      venue: {
        name: row.stadium ?? "",
        stadiumId: row.stadium_id ?? "",
        roof: roofOf(row.roof ?? ""),
      },
      finalScore: scorePair(row.home_score ?? "", row.away_score ?? ""),
      scheduleSpread:
        spread !== null && Number.isFinite(spread) ? homeLineFromNflverseSpread(spread) : null,
    };
  });
}
