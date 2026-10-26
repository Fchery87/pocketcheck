import { americanToDecimal, PriceError } from "#lib/domain/odds.ts";
import {
  offerEntryGuidance,
  type Market,
  type SideSelection,
  type TieRule,
} from "#lib/domain/offer.ts";

export { offerEntryGuidance };

export type RefreshParent = {
  market: Market;
  selection: SideSelection;
  pointLine: number | null;
  sportsbook: string;
  americanOdds: number;
  tieRule: TieRule | null;
};

export type RefreshFields = {
  sportsbook: string;
  pointLine: string;
  americanOdds: string;
  observedAt: string;
  market: string;
  selection: string;
};

export type RefreshContract = {
  market: Market;
  selection: SideSelection;
  pointLine: number | undefined;
  sportsbook: string;
  americanOdds: number;
  observedAt: string;
  tieRule: TieRule | undefined;
};

export type RefreshParse =
  | { ok: true; contract: RefreshContract; values: RefreshFields }
  | { ok: false; error: string; values: RefreshFields };

/**
 * A refresh may change the line, book, price, and observation time.
 * Market and selection stay the parent's. A different pair is separate research.
 */
export function parseRefreshContract(fields: RefreshFields, parent: RefreshParent): RefreshParse {
  const values = { ...fields };
  if (fields.market !== parent.market || fields.selection !== parent.selection) {
    return {
      ok: false,
      values,
      error:
        "A different market or selection is separate research. Start a new analysis instead of refreshing this one.",
    };
  }
  const guidance = offerEntryGuidance(parent.market);
  if (!guidance.selections.includes(parent.selection)) {
    return { ok: false, values, error: "The saved selection does not belong to this market." };
  }
  const sportsbook = fields.sportsbook.trim();
  if (!sportsbook) return { ok: false, values, error: "Enter the sportsbook" };

  let pointLine: number | undefined;
  if (guidance.line) {
    if (!fields.pointLine.trim()) {
      return { ok: false, values, error: `A ${parent.market} requires a point line` };
    }
    pointLine = Number(fields.pointLine);
    if (!Number.isFinite(pointLine)) {
      return { ok: false, values, error: "The point line is not a number" };
    }
  }

  const americanOdds = Number(fields.americanOdds);
  try {
    americanToDecimal(americanOdds);
  } catch (error) {
    const message = error instanceof PriceError ? error.message : "Enter a valid American price";
    return { ok: false, values, error: message };
  }

  const observedAt = parseObservedAt(fields.observedAt);
  if (!observedAt) return { ok: false, values, error: "Enter when you observed the new price" };

  return {
    ok: true,
    values,
    contract: {
      market: parent.market,
      selection: parent.selection,
      pointLine,
      sportsbook,
      americanOdds,
      observedAt,
      tieRule: parent.market === "moneyline" ? (parent.tieRule ?? undefined) : undefined,
    },
  };
}

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
