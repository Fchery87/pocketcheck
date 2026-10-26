import { describe, expect, it } from "vite-plus/test";
import {
  localInputValue,
  parseManualEvidence,
  parseObservedAt,
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
