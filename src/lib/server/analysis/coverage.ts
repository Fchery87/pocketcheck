import type { EvidenceItem } from "../sources/contracts.ts";
import type { MaterialGap, MaterialGapKind } from "./evidence.ts";

/** How recent tagged manual evidence must be, relative to the run's decision cutoff. */
export const MANUAL_FRESHNESS_HOURS: Record<MaterialGapKind, number> = {
  "injury-report": 24,
  weather: 12,
};

const LABELS: Record<MaterialGapKind, string> = {
  "injury-report": "injury report",
  weather: "kickoff forecast",
};

export type ManualCoverage = { kind: MaterialGapKind; evidenceId: string };

/**
 * Which material gaps fresh, tagged manual evidence clears. A tagged item clears its gap only
 * with a known source time no later than the cutoff and within that gap's freshness window.
 */
export function coverMaterialGaps(
  gaps: readonly MaterialGap[],
  manual: readonly EvidenceItem[],
  cutoffIso: string,
): { remaining: MaterialGap[]; covered: ManualCoverage[]; notes: string[] } {
  const cutoff = Date.parse(cutoffIso);
  const remaining: MaterialGap[] = [];
  const covered: ManualCoverage[] = [];
  const notes: string[] = [];
  for (const gap of gaps) {
    const label = LABELS[gap.kind];
    const limit = MANUAL_FRESHNESS_HOURS[gap.kind];
    let cover: EvidenceItem | null = null;
    for (const item of manual.filter((candidate) => candidate.facts.covers === gap.kind)) {
      if (gap.team && item.facts.team !== gap.team) {
        notes.push(
          `Manual evidence ${item.id} is tagged as the ${label} but not for ${gap.team}, so it does not clear that team's coverage.`,
        );
        continue;
      }
      if (item.publishedAt === "unknown") {
        notes.push(
          `Manual evidence ${item.id} is tagged as the ${label} but has no source time, so it cannot stand in for it.`,
        );
        continue;
      }
      const hours = (cutoff - Date.parse(item.publishedAt)) / 3_600_000;
      if (hours < 0) continue;
      if (hours > limit) {
        notes.push(
          `Manual evidence ${item.id} is ${Math.floor(hours)} hours old; the ${label} needs one from the last ${limit} hours.`,
        );
        continue;
      }
      cover ??= item;
    }
    if (cover) {
      covered.push({ kind: gap.kind, evidenceId: cover.id });
      notes.push(`The ${label} comes from manual evidence ${cover.id}.`);
    } else {
      remaining.push(gap);
    }
  }
  return { remaining, covered, notes };
}
