import { describe, expect, it } from "vite-plus/test";
import { injuryImpact, type InjuryDesignation } from "../../src/lib/server/models/injuries.ts";

const cutoff = "2026-10-25T16:00:00.000Z";

function out(overrides: Partial<InjuryDesignation> = {}): InjuryDesignation {
  return {
    team: "PHI",
    playerId: "tackle",
    position: "T",
    status: "out",
    publishedAt: "2026-10-24T18:00:00.000Z",
    snapShare: 0.9,
    ...overrides,
  };
}

describe("injury impact", () => {
  it("weights an out player by snap share times position value, and ignores a quarterback", () => {
    const impact = injuryImpact(
      [out(), out({ playerId: "qb", position: "QB", snapShare: 1 })],
      cutoff,
    );
    expect(impact.PHI?.offense).toBeCloseTo(0.9 * 0.6, 10);
    expect(impact.PHI?.line).toBe(1);
  });

  it("ignores a designation published after the cutoff", () => {
    const impact = injuryImpact([out({ publishedAt: "2026-10-25T18:00:00.000Z" })], cutoff);
    expect(impact.PHI).toBeUndefined();
  });

  it("leaves a player with no snap share unknown instead of healthy", () => {
    const impact = injuryImpact([out({ snapShare: null })], cutoff);
    expect(impact.PHI).toMatchObject({ unknown: 1, offense: 0 });
  });

  it("ignores a designation with no publication time", () => {
    const impact = injuryImpact([out({ publishedAt: null })], cutoff);
    expect(impact.PHI).toBeUndefined();
  });
});
