import type { EvidenceItem } from "./contracts.ts";
import { evidenceItem } from "./item.ts";
import { parseCsv } from "./nflverse.ts";

const PUBLICATION_GAP =
  "nflverse injury rows have no publication time. publishedAt stays unknown. Confirm material designations with a manual club report.";

export type InjuryTeamCoverage = "players" | "empty" | "unknown";

export type InjuryRead = {
  items: EvidenceItem[];
  gaps: string[];
  /** Coverage established for each requested team. Player rows never imply the other team. */
  teams: Record<string, InjuryTeamCoverage>;
};

export function injuryEvidenceFromCsv(
  csv: string,
  input: {
    season: number;
    week: number;
    teams: string[];
    retrievedAt: string;
    sourceUrl: string;
  },
): InjuryRead {
  const rows = parseCsv(csv);
  const wanted = new Set(input.teams);
  const matching = rows.filter(
    (row) =>
      Number(row.season) === input.season &&
      Number(row.week) === input.week &&
      wanted.has(row.team ?? "") &&
      (row.report_status ?? "") !== "",
  );
  const gaps = [PUBLICATION_GAP];
  const teams: Record<string, InjuryTeamCoverage> = {};
  const uncovered: string[] = [];
  for (const team of input.teams) {
    const rowsForTeam = matching.filter((row) => row.team === team);
    const empty = rows.some(
      (row) =>
        Number(row.season) === input.season &&
        Number(row.week) === input.week &&
        row.team === team &&
        (row.report_status ?? "") === "" &&
        (row.coverage ?? "") === "empty",
    );
    if (rowsForTeam.length > 0) teams[team] = "players";
    else if (empty) teams[team] = "empty";
    else {
      teams[team] = "unknown";
      uncovered.push(team);
    }
  }
  if (uncovered.length > 0) {
    gaps.unshift(
      `No ${input.season} week ${input.week} injury coverage for ${uncovered.join(", ")}. Absence of player rows is not a clean report. Do not substitute another season or another team. Use manual evidence scoped to each missing team.`,
    );
  }
  const items = matching.map((row) =>
    evidenceItem({
      sourceId: "nflverse-injuries",
      url: input.sourceUrl,
      retrievedAt: input.retrievedAt,
      publishedAt: "unknown",
      origin: "automatic",
      factKey: `availability:${row.team}:${row.full_name}`,
      facts: {
        season: Number(row.season),
        week: Number(row.week),
        team: row.team ?? "",
        player: row.full_name ?? "",
        playerId: row.gsis_id || null,
        position: row.position ?? "",
        reportStatus: row.report_status ?? "",
        reportPrimaryInjury: row.report_primary_injury || null,
        practiceStatus: row.practice_status || null,
      },
    }),
  );
  return { items, gaps, teams };
}
