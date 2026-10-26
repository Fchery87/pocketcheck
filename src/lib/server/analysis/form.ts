const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Reads an observed-time field. A datetime-local value has no zone, so it is read
 * as this computer's local time; PocketCheck runs on the user's own machine.
 */
export function parseObservedAt(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const local = LOCAL_INPUT.exec(value);
  const instant = local
    ? new Date(
        Number(local[1]),
        Number(local[2]) - 1,
        Number(local[3]),
        Number(local[4]),
        Number(local[5]),
      )
    : new Date(value);
  return Number.isFinite(instant.getTime()) ? instant.toISOString() : null;
}

/** A datetime-local value for an instant, in this computer's local time. */
export function localInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type ManualEvidenceRow = { text: string; url: string; time: string; covers: string };

export type ManualEvidenceForm =
  | {
      ok: true;
      rows: ManualEvidenceRow[];
      entries: Array<{
        text: string;
        url: string;
        sourceTime: string;
        covers?: "injury-report" | "weather";
      }>;
    }
  | { ok: false; rows: ManualEvidenceRow[]; error: string };

/**
 * Reads the repeated manualText, manualUrl, manualTime, and manualCovers fields. Blank rows are
 * skipped. A blank source time means the source did not say when it was published.
 */
export function parseManualEvidence(data: FormData): ManualEvidenceForm {
  const all = (name: string) => data.getAll(name).map((value) => String(value).trim());
  const [texts, urls, times, covers] = [
    all("manualText"),
    all("manualUrl"),
    all("manualTime"),
    all("manualCovers"),
  ];
  const rows = texts
    .map((text, index) => ({
      text,
      url: urls[index] ?? "",
      time: times[index] ?? "",
      covers: covers[index] ?? "",
    }))
    .filter((row) => row.text || row.url || row.time || row.covers);
  const entries: Array<{
    text: string;
    url: string;
    sourceTime: string;
    covers?: "injury-report" | "weather";
  }> = [];
  for (const [index, row] of rows.entries()) {
    if (row.covers && row.covers !== "injury-report" && row.covers !== "weather") {
      return { ok: false, rows, error: `Manual evidence ${index + 1}: unknown source tag` };
    }
    const covers =
      row.covers === "injury-report" || row.covers === "weather" ? row.covers : undefined;
    const sourceTime = row.time ? parseObservedAt(row.time) : "unknown";
    if (!sourceTime) {
      return {
        ok: false,
        rows,
        error: `Manual evidence ${index + 1}: the source time is not a date and time`,
      };
    }
    entries.push({
      text: row.text,
      url: row.url,
      sourceTime,
      ...(covers ? { covers } : {}),
    });
  }
  return { ok: true, rows, entries };
}
