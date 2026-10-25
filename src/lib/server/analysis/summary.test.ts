import { describe, expect, it } from "vite-plus/test";
import { applySettlementNotices, summarizeBets, summarizePrimary } from "./summary.ts";

describe("prospective summaries", () => {
  it("does not grade push, void, unresolved, or postponement as a loss", () => {
    const summary = summarizePrimary([
      { id: "w", gameId: "g", role: "primary", settlement: "win", unitProfit: 0.91 },
      { id: "p", gameId: "g2", role: "primary", settlement: "push", unitProfit: 0 },
      { id: "v", gameId: "g3", role: "primary", settlement: "void", unitProfit: 0 },
      { id: "u", gameId: "g4", role: "primary", settlement: "unresolved", unitProfit: null },
      { id: "post", gameId: "g5", role: "primary", settlement: "postponed", unitProfit: null },
    ]);
    expect(summary.sample).toBe("primary-only");
    expect(summary.graded).toBe(1);
    expect(summary.unavailable).toBe(4);
    expect(summary.roi).toEqual({ available: true, roi: 0.91 });
  });

  it("does not pool refreshes into the primary ROI", () => {
    const summary = summarizePrimary([
      { id: "primary", gameId: "g", role: "primary", settlement: "loss", unitProfit: -1 },
      { id: "refresh", gameId: "g", role: "refresh", settlement: "win", unitProfit: 2 },
    ]);
    expect(summary.graded).toBe(1);
    expect(summary.roi).toEqual({ available: true, roi: -1 });
  });

  it("keeps actual bets separate from system primary results", () => {
    const bets = summarizeBets([
      { id: "bet", stakeUnits: 2, settlement: "win", profit: 1.8 },
      { id: "open", stakeUnits: 5, settlement: "unresolved", profit: null },
    ]);
    expect(bets.sample).toBe("actual-bets");
    expect(bets.roi).toEqual({ available: true, roi: 1.8 / 2 });
    expect(bets.unavailable).toBe(1);
  });

  it("leaves ROI unavailable when every primary row is unresolved", () => {
    const summary = summarizePrimary([
      { id: "u", gameId: "g", role: "primary", settlement: "unresolved", unitProfit: null },
    ]);
    expect(summary.roi.available).toBe(false);
    if (!summary.roi.available) expect(summary.roi.reason).not.toBe("");
  });

  it("keeps postponement unresolved, ignores a duplicate, and keeps correction history", () => {
    const applied = applySettlementNotices([
      { id: "first", result: "loss", reason: "early score", correctsId: null },
      { id: "dup", result: "loss", reason: "replay", correctsId: null, duplicateOfId: "first" },
      { id: "fix", result: "win", reason: "official score correction", correctsId: "first" },
    ]);
    expect(applied.ignoredDuplicateIds).toEqual(["dup"]);
    expect(applied.history.map((row) => row.id)).toEqual(["first", "fix"]);
    expect(applied.current).toBe("win");

    const postponed = applySettlementNotices([
      { id: "post", result: "postponed", reason: "weather", correctsId: null },
    ]);
    expect(postponed.current).toBe("unresolved");
    expect(postponed.history).toHaveLength(1);
  });
});
