import { describe, expect, it } from "vite-plus/test";
import {
  localInputValue,
  offerEntryGuidance,
  parseManualEvidence,
  parseObservedAt,
  parseRefreshContract,
} from "#lib/server/analysis/form.ts";

describe("observed time input", () => {
  it("reads a browser datetime-local value as this computer's local time", () => {
    expect(parseObservedAt("2026-10-25T11:30")).toBe(new Date(2026, 9, 25, 11, 30).toISOString());
  });

  it("accepts a full ISO timestamp unchanged in meaning", () => {
    expect(parseObservedAt("2026-10-25T15:30:00Z")).toBe("2026-10-25T15:30:00.000Z");
  });

  it("returns null for a blank or unreadable time instead of inventing one", () => {
    expect(parseObservedAt("")).toBeNull();
    expect(parseObservedAt("   ")).toBeNull();
    expect(parseObservedAt("yesterday")).toBeNull();
  });

  it("formats a default input value that reads back as the same minute", () => {
    const iso = "2026-10-25T16:07:42.000Z";
    expect(parseObservedAt(localInputValue(iso))).toBe("2026-10-25T16:07:00.000Z");
  });
});

describe("offer entry guidance", () => {
  it("offers only home or away for a moneyline and requires a tie rule", () => {
    expect(offerEntryGuidance("moneyline")).toEqual({
      selections: ["home", "away"],
      line: null,
      tieRule: "A moneyline needs a tie rule: push, loss, win, or void.",
      explanation:
        "Home and away are the two sides. A tie is not a win or a loss until the tie rule says so.",
    });
  });

  it("explains that a spread line is the selected side's sign", () => {
    expect(offerEntryGuidance("spread")).toEqual({
      selections: ["home", "away"],
      line: "Enter the line for the side you selected. Home −3.5 is the home side. The other side is +3.5, not the same number.",
      tieRule: null,
      explanation:
        "A positive line means that side is getting points. A negative line means that side is giving points.",
    });
  });

  it("explains that a total line is the same number for over and under", () => {
    expect(offerEntryGuidance("total")).toEqual({
      selections: ["over", "under"],
      line: "Enter the total. Over 44.5 and under 44.5 share that number.",
      tieRule: null,
      explanation:
        "Over wins when the combined score is above the line. Under wins when it is below.",
    });
  });
});

describe("parseRefreshContract", () => {
  const parent = {
    market: "spread" as const,
    selection: "home" as const,
    pointLine: -3.5,
    sportsbook: "Example Book",
    americanOdds: -110,
    tieRule: null,
  };

  function fields(overrides: Record<string, string> = {}) {
    return {
      sportsbook: "Other Book",
      pointLine: "-2.5",
      americanOdds: "-105",
      observedAt: "2026-10-25T11:50",
      market: "spread",
      selection: "home",
      ...overrides,
    };
  }

  it("accepts a changed line, book, odds, and observation time while keeping the parent market and selection", () => {
    const parsed = parseRefreshContract(fields(), parent);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.contract).toEqual({
      market: "spread",
      selection: "home",
      pointLine: -2.5,
      sportsbook: "Other Book",
      americanOdds: -105,
      observedAt: new Date(2026, 9, 25, 11, 50).toISOString(),
      tieRule: undefined,
    });
  });

  it("refuses a different market or selection instead of rewriting the refresh chain", () => {
    expect(
      parseRefreshContract(fields({ market: "total", selection: "over" }), parent),
    ).toMatchObject({
      ok: false,
      error: expect.stringMatching(/separate research/i),
    });
    expect(parseRefreshContract(fields({ selection: "away" }), parent)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/separate research/i),
    });
  });

  it("keeps the entered refresh values when the new contract is invalid", () => {
    const entered = fields({ pointLine: "", americanOdds: "not a price" });
    const parsed = parseRefreshContract(entered, parent);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.values).toMatchObject(entered);
    expect(parsed.error).toMatch(/point line|price/i);
  });

  it("reads a refreshed total line and leaves a moneyline without one", () => {
    const total = parseRefreshContract(
      fields({ market: "total", selection: "over", pointLine: "47.5" }),
      { ...parent, market: "total", selection: "over", pointLine: 44.5 },
    );
    expect(total.ok && total.contract.pointLine).toBe(47.5);
    const moneyline = parseRefreshContract(
      fields({ market: "moneyline", selection: "away", pointLine: "" }),
      {
        ...parent,
        market: "moneyline",
        selection: "away",
        pointLine: null,
        tieRule: "push" as const,
      },
    );
    expect(moneyline.ok && moneyline.contract).toMatchObject({
      market: "moneyline",
      selection: "away",
      pointLine: undefined,
      tieRule: "push",
    });
  });
});

describe("parseManualEvidence", () => {
  function form(rows: Array<[string, string, string]>) {
    const data = new FormData();
    for (const [text, url, time] of rows) {
      data.append("manualText", text);
      data.append("manualUrl", url);
      data.append("manualTime", time);
    }
    return data;
  }

  it("skips blank rows and reads a blank source time as unknown", () => {
    const parsed = parseManualEvidence(
      form([
        ["", "", ""],
        ["Club report lists him out.", "https://example.test/report", ""],
        ["", "https://example.test/only-a-link", "2026-10-25T09:15"],
      ]),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.entries).toEqual([
      {
        text: "Club report lists him out.",
        url: "https://example.test/report",
        sourceTime: "unknown",
      },
      {
        text: "",
        url: "https://example.test/only-a-link",
        sourceTime: new Date(2026, 9, 25, 9, 15).toISOString(),
      },
    ]);
  });

  it("names the row with an unreadable source time and returns the rows for re-entry", () => {
    const parsed = parseManualEvidence(
      form([
        ["First note.", "", ""],
        ["Second note.", "", "yesterday"],
      ]),
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toMatch(/evidence 2/i);
    expect(parsed.rows.map((row) => row.text)).toEqual(["First note.", "Second note."]);
  });

  it("reads which missing source a manual entry stands in for", () => {
    const data = new FormData();
    data.append("manualText", "Kickoff 52F, light wind");
    data.append("manualUrl", "");
    data.append("manualTime", "2026-10-25T11:00");
    data.append("manualCovers", "weather");
    const parsed = parseManualEvidence(data);
    expect(parsed.ok && parsed.entries[0]?.covers).toBe("weather");
  });

  it("refuses an unknown source tag", () => {
    const data = new FormData();
    data.append("manualText", "note");
    data.append("manualUrl", "");
    data.append("manualTime", "");
    data.append("manualCovers", "odds");
    expect(parseManualEvidence(data)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/source tag/),
    });
  });
});
