import { checksumOf } from "./cache.ts";
import type { EvidenceFacts, EvidenceItem, SourceTime } from "./contracts.ts";

let sequence = 0;

export function nextEvidenceId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export function evidenceItem(input: {
  sourceId: string;
  url: string | null;
  retrievedAt: string;
  publishedAt: SourceTime;
  origin: EvidenceItem["origin"];
  facts: EvidenceFacts;
  excerpt?: string | null;
  checksum?: string | null;
  factKey?: string | null;
}): EvidenceItem {
  const excerpt = input.excerpt ?? null;
  return {
    id: nextEvidenceId(input.sourceId),
    sourceId: input.sourceId,
    url: input.url,
    retrievedAt: input.retrievedAt,
    publishedAt: input.publishedAt,
    origin: input.origin,
    facts: input.facts,
    excerpt,
    checksum: input.checksum ?? (excerpt ? checksumOf(excerpt) : null),
    factKey: input.factKey ?? null,
  };
}
