import type { EvidenceItem } from "./contracts.ts";
import { evidenceItem } from "./item.ts";
import { parseCsv } from "./nflverse.ts";

const PUBLICATION_GAP =
  "nflverse injury rows have no publication time. publishedAt stays unknown. Confirm material designations with a manual club report.";

export type InjuryRead = {
  items: EvidenceItem[];
  gaps: string[];
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
  if (matching.length === 0) {
    gaps.unshift(
      `No ${input.season} week ${input.week} injury rows for ${input.teams.join(", ")}. Do not substitute another season. Use manual evidence.`,
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
        position: row.position ?? "",
        reportStatus: row.report_status ?? "",
        reportPrimaryInjury: row.report_primary_injury || null,
        practiceStatus: row.practice_status || null,
      },
    }),
  );
  return { items, gaps };
}
