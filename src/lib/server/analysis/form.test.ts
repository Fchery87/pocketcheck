import { describe, expect, it } from "vite-plus/test";
import { localInputValue, parseObservedAt } from "#lib/server/analysis/form.ts";

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
