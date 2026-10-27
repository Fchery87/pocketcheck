import { assembleEvidencePacket } from "../sources/packet.ts";
import type { EvidenceItem, ScheduledGame } from "../sources/contracts.ts";
import { coverMaterialGaps, type ManualCoverage } from "./coverage.ts";
import type { EvidenceCollector } from "./evidence.ts";

export function scheduleEvidence(game: ScheduledGame, retrievedAt: string): EvidenceItem {
  return {
    id: `schedule:${game.id}`,
    sourceId: "nflverse-schedule",
    url: null,
    retrievedAt,
    publishedAt: "unknown",
    origin: "automatic",
    facts: {
      home: game.home,
      away: game.away,
      kickoff: game.kickoff,
      venue: game.venue.name,
    },
    excerpt: `${game.away} at ${game.home}, ${game.venue.name}`,
    checksum: null,
    factKey: `schedule:${game.id}`,
  };
}

export type GatheredEvidence = {
  /** Packet items at or before the decision cutoff. */
  items: EvidenceItem[];
  /** Every gap the record must show: source gaps, coverage notes, conflicts, late exclusions. */
  gaps: string[];
  /** True when a material gap stays uncovered or sources disagree. */
  materialEvidenceMissing: boolean;
  manualCoverage: ManualCoverage[];
};

/**
 * Collects automatic evidence, lets fresh manual evidence cover material gaps, and assembles
 * the packet with the schedule. Shared by research analyses and game boards.
 */
export async function gatherEvidence(input: {
  game: ScheduledGame;
  nowIso: string;
  scheduleRetrievedAt: string;
  collect: EvidenceCollector;
  carried: EvidenceItem[];
  manual: EvidenceItem[];
}): Promise<GatheredEvidence> {
  const collected = await input.collect(input.game, input.nowIso);
  const coverage = coverMaterialGaps(
    collected.materialGaps,
    [...input.carried, ...input.manual],
    input.nowIso,
  );
  const packet = assembleEvidencePacket({
    game: input.game,
    decisionCutoff: input.nowIso,
    items: [
      scheduleEvidence(input.game, input.scheduleRetrievedAt),
      ...collected.items,
      ...input.carried,
      ...input.manual,
    ],
    gaps: collected.gaps,
  });
  const conflictGaps = packet.conflicts.map(
    (conflict) => `Sources disagree on ${conflict.factKey}: ${conflict.itemIds.join(", ")}.`,
  );
  const late = packet.rejectedAfterCutoff;
  const gaps = [
    ...packet.gaps,
    ...coverage.notes,
    ...conflictGaps,
    ...(late.length > 0
      ? [
          `Excluded ${late.length} evidence item${late.length === 1 ? "" : "s"} dated after the decision cutoff: ${late
            .map((item) => item.excerpt ?? item.id)
            .join("; ")}`,
        ]
      : []),
  ];
  return {
    items: packet.items,
    gaps,
    materialEvidenceMissing: coverage.remaining.length > 0 || conflictGaps.length > 0,
    manualCoverage: coverage.covered,
  };
}
