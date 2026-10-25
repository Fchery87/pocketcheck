import type { ModelCatalogEntry } from "./contracts.ts";

export function selectThesisModel(
  entries: ModelCatalogEntry[],
  input: { provider: "theclawbay" | "deepseek" },
): { preferredId: string | null; entries: ModelCatalogEntry[] } {
  const preferredId =
    input.provider === "theclawbay" &&
    // Suggested even while untested; it still has to pass a test before it can draft.
    entries.some((entry) => entry.id === "grok-4.7" && entry.capability !== "unsupported")
      ? "grok-4.7"
      : null;
  return { preferredId, entries: entries.map((entry) => ({ ...entry })) };
}
