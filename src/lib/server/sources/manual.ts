import type { EvidenceFacts, EvidenceItem, SourceTime } from "./contracts.ts";
import { evidenceItem } from "./item.ts";

export function createManualEvidence(input: {
  text?: string;
  url?: string;
  sourceTime: SourceTime;
  enteredAt: string;
  factKey?: string;
  facts?: EvidenceFacts;
}): EvidenceItem {
  const text = input.text?.trim() ?? "";
  const url = input.url?.trim() ?? "";
  if (!text && !url) {
    throw new Error("Manual evidence requires text or url.");
  }
  if (input.sourceTime !== "unknown" && Number.isNaN(Date.parse(input.sourceTime))) {
    throw new Error("Manual evidence source time must be a timestamp or unknown.");
  }
  if (Number.isNaN(Date.parse(input.enteredAt))) {
    throw new Error("Manual evidence requires an entry time.");
  }
  return evidenceItem({
    sourceId: "manual",
    url: url || null,
    retrievedAt: input.enteredAt,
    publishedAt: input.sourceTime,
    origin: "manual",
    excerpt: text || null,
    factKey: input.factKey ?? null,
    facts: input.facts ?? { note: text },
  });
}
