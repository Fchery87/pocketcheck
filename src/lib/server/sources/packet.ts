import type { EvidenceConflict, EvidenceItem, EvidencePacket, ScheduledGame } from "./contracts.ts";

function effectiveInstant(item: EvidenceItem): number | null {
  if (item.publishedAt !== "unknown") {
    const published = Date.parse(item.publishedAt);
    if (Number.isFinite(published)) return published;
  }
  const retrieved = Date.parse(item.retrievedAt);
  return Number.isFinite(retrieved) ? retrieved : null;
}

function factSignature(item: EvidenceItem): string {
  return JSON.stringify(item.facts);
}

export function assembleEvidencePacket(input: {
  game: ScheduledGame;
  decisionCutoff: string;
  items: EvidenceItem[];
  gaps: string[];
}): EvidencePacket {
  const cutoff = Date.parse(input.decisionCutoff);
  const kickoff = Date.parse(input.game.kickoff);
  const gaps = [...input.gaps];
  if (Number.isFinite(kickoff) && kickoff <= cutoff) {
    gaps.push(
      "Game has already started relative to the decision cutoff. Schedule facts after kickoff are excluded.",
    );
    return {
      decisionCutoff: input.decisionCutoff,
      game: null,
      items: [],
      rejectedAfterCutoff: [],
      conflicts: [],
      gaps,
    };
  }

  const accepted: EvidenceItem[] = [];
  const rejectedAfterCutoff: EvidenceItem[] = [];
  for (const item of input.items) {
    const instant = effectiveInstant(item);
    if (instant !== null && instant > cutoff) rejectedAfterCutoff.push(item);
    else accepted.push(item);
  }

  for (const item of accepted) {
    if (item.publishedAt === "unknown" && !gaps.some((gap) => /publication time/i.test(gap))) {
      gaps.push("At least one evidence item has an unknown publication time.");
    }
  }

  const byKey = new Map<string, EvidenceItem[]>();
  for (const item of accepted) {
    if (!item.factKey) continue;
    const group = byKey.get(item.factKey) ?? [];
    group.push(item);
    byKey.set(item.factKey, group);
  }
  const conflicts: EvidenceConflict[] = [];
  for (const [factKey, group] of byKey) {
    const signatures = new Set(group.map(factSignature));
    if (signatures.size > 1) {
      conflicts.push({
        factKey,
        itemIds: group.map((item) => item.id),
        summary: `${group.length} observations disagree on ${factKey}.`,
      });
    }
  }

  return {
    decisionCutoff: input.decisionCutoff,
    game: input.game,
    items: accepted,
    rejectedAfterCutoff,
    conflicts,
    gaps,
  };
}
