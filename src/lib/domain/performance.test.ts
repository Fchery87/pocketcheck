import { describe, expect, it } from "vite-plus/test";
import { returnOnSettledStakes } from "#lib/domain/performance.ts";

describe("settled-stake return", () => {
  it("leaves ROI unavailable when no stakes have settled", () => {
    expect(returnOnSettledStakes([{ profit: 0, stake: 1, status: "unresolved" }])).toEqual({
      available: false,
      reason: "empty-denominator",
    });
  });

  it("divides profit by settled stakes and ignores unresolved rows", () => {
    expect(
      returnOnSettledStakes([
        { profit: 0.9090909, stake: 1, status: "settled" },
        { profit: -1, stake: 1, status: "settled" },
        { profit: 0, stake: 5, status: "unresolved" },
      ]),
    ).toEqual({
      available: true,
      roi: expect.closeTo((0.9090909 - 1) / 2, 6),
    });
  });
});
