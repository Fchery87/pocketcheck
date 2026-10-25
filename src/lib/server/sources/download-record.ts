import { readFileSync, statSync } from "node:fs";

/**
 * Where and when a cached download came from, read from the `.json` record the data scripts
 * write beside the file. Without a record, the file's write time stands in for the retrieval.
 */
export function readDownloadRecord(path: string): { retrievedAt: string; source: string | null } {
  try {
    const record = JSON.parse(readFileSync(`${path}.json`, "utf8")) as {
      retrievedAt?: string;
      source?: string;
    };
    if (record.retrievedAt && Number.isFinite(Date.parse(record.retrievedAt))) {
      return {
        retrievedAt: new Date(record.retrievedAt).toISOString(),
        source: typeof record.source === "string" ? record.source : null,
      };
    }
  } catch {
    // No download record.
  }
  return { retrievedAt: statSync(path).mtime.toISOString(), source: null };
}
