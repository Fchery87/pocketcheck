import { describe, expect, it } from "vitest";
import { easternDateTimeInput, parseEasternTime } from "./time.ts";

describe("Eastern wall time", () => {
  it("uses Eastern time rather than the process timezone", () => {
    expect(parseEasternTime("2026-10-25T12:30")).toEqual({
      ok: true,
      iso: "2026-10-25T16:30:00.000Z",
    });
    expect(easternDateTimeInput("2026-10-26T01:30:00Z")).toBe("2026-10-25T21:30");
  });
  it("rejects invalid calendar dates and spring-forward gaps", () => {
    for (const value of ["garbage", "2026-02-30T12:00", "2026-03-08T02:30", "2026-13-01T00:00"]) {
      expect(parseEasternTime(value).ok).toBe(false);
    }
  });
  it("requires a fall-back occurrence and preserves explicit offsets", () => {
    expect(parseEasternTime("2026-11-01T01:30").ok).toBe(false);
    expect(parseEasternTime("2026-11-01T01:30", "earlier")).toEqual({
      ok: true,
      iso: "2026-11-01T05:30:00.000Z",
    });
    expect(parseEasternTime("2026-11-01T01:30", "later")).toEqual({
      ok: true,
      iso: "2026-11-01T06:30:00.000Z",
    });
    expect(parseEasternTime("2026-11-01T01:30-05:00")).toEqual({
      ok: true,
      iso: "2026-11-01T06:30:00.000Z",
    });
    expect(parseEasternTime("2026-02-30T12:00Z").ok).toBe(false);
  });
});
