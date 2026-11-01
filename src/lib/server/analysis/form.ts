import { americanToDecimal, PriceError } from "#lib/domain/odds.ts";
import { easternDateTimeInput, parseEasternTime } from "#lib/time.ts";
import {
  offerEntryGuidance,
  type Market,
  type SideSelection,
  type TieRule,
  type OpposingPrice,
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
  timeOccurrence?: string;
  market: string;
  selection: string;
  opposingAmericanOdds?: string;
};

export type RefreshContract = {
  market: Market;
  selection: SideSelection;
  pointLine: number | undefined;
  sportsbook: string;
  americanOdds: number;
  observedAt: string;
  tieRule: TieRule | undefined;
  opposing?: OpposingPrice;
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

  const parsedTime = parseEasternTime(
    fields.observedAt,
    fields.timeOccurrence === "earlier" || fields.timeOccurrence === "later"
      ? fields.timeOccurrence
      : undefined,
  );
  if (!parsedTime.ok) return { ok: false, values, error: parsedTime.error };
  const observedAt = parsedTime.iso;
  let opposing: OpposingPrice | undefined;
  try {
    opposing = parseOpposingPrice(fields.opposingAmericanOdds ?? "", {
      sportsbook,
      market: parent.market,
      pointLine,
      observedAt,
    });
  } catch (error) {
    return {
      ok: false,
      values,
      error: error instanceof Error ? error.message : "Invalid opposing price",
    };
  }

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
      opposing,
      tieRule: parent.market === "moneyline" ? (parent.tieRule ?? undefined) : undefined,
    },
  };
}

export function parseOpposingPrice(
  raw: string,
  offer: {
    sportsbook: string;
    market: Market;
    pointLine?: number;
    observedAt: string;
  },
): OpposingPrice | undefined {
  if (!raw.trim()) return undefined;
  const americanOdds = Number(raw);
  americanToDecimal(americanOdds);
  return {
    sportsbook: offer.sportsbook,
    americanOdds,
    observedAt: offer.observedAt,
    ...(offer.pointLine === undefined
      ? {}
      : { pointLine: offer.market === "spread" ? -offer.pointLine : offer.pointLine }),
  };
}

export function parseObservedAt(raw: string, occurrence?: string): string | null {
  const parsed = parseEasternTime(
    raw,
    occurrence === "earlier" || occurrence === "later" ? occurrence : undefined,
  );
  return parsed.ok ? parsed.iso : null;
}

export function localInputValue(iso: string): string {
  return easternDateTimeInput(iso);
}

export type ManualEvidenceRow = {
  text: string;
  url: string;
  time: string;
  covers: string;
  team: string;
};

export type ManualEvidenceForm =
  | {
      ok: true;
      rows: ManualEvidenceRow[];
      entries: Array<{
        text: string;
        url: string;
        sourceTime: string;
        covers?: "injury-report" | "weather";
        team?: string;
      }>;
    }
  | { ok: false; rows: ManualEvidenceRow[]; error: string };

/**
 * Reads the repeated manualText, manualUrl, manualTime, manualCovers, and manualTeam fields. Blank rows are
 * skipped. A blank source time means the source did not say when it was published.
 * A team is required only when the entry stands in for that team's injury report.
 */
export function parseManualEvidence(data: FormData): ManualEvidenceForm {
  const all = (name: string) => data.getAll(name).map((value) => String(value).trim());
  const [texts, urls, times, covers, teams] = [
    all("manualText"),
    all("manualUrl"),
    all("manualTime"),
    all("manualCovers"),
    all("manualTeam"),
  ];
  const rows = texts
    .map((text, index) => ({
      text,
      url: urls[index] ?? "",
      time: times[index] ?? "",
      covers: covers[index] ?? "",
      team: (teams[index] ?? "").toUpperCase(),
    }))
    .filter((row) => row.text || row.url || row.time || row.covers || row.team);
  const entries: Array<{
    text: string;
    url: string;
    sourceTime: string;
    covers?: "injury-report" | "weather";
    team?: string;
  }> = [];
  for (const [index, row] of rows.entries()) {
    if (row.covers && row.covers !== "injury-report" && row.covers !== "weather") {
      return { ok: false, rows, error: `Manual evidence ${index + 1}: unknown source tag` };
    }
    const covers =
      row.covers === "injury-report" || row.covers === "weather" ? row.covers : undefined;
    const team = /^[A-Z]{2,3}$/.test(row.team) ? row.team : undefined;
    if (covers === "injury-report" && !team) {
      return {
        ok: false,
        rows,
        error: `Manual evidence ${index + 1}: an injury report needs the team it covers`,
      };
    }
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
      ...(team ? { team } : {}),
    });
  }
  return { ok: true, rows, entries };
}
