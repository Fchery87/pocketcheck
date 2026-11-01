import { describe, expect, it } from "vite-plus/test";
import { settlementPrefill } from "./settlement-prefill.ts";
import type { ScheduledGame } from "../sources/contracts.ts";

const game: ScheduledGame = {
  id: "2026_07_DAL_PHI",
  season: 2026,
  week: 7,
  home: "PHI",
  away: "DAL",
  kickoff: "2026-10-25T17:00:00.000Z",
  venue: { name: "Philadelphia", stadiumId: "phi", roof: "outdoors" },
  finalScore: { home: 24, away: 21 },
  scheduleSpread: null,
};
const input = () => ({
  game: { id: game.id, home: game.home, away: game.away, kickoff: game.kickoff },
  schedule: {
    ok: true as const,
    path: "fixture.csv",
    games: [game],
    retrievedAt: "2026-10-25T22:00:00.000Z",
  },
  now: "2026-10-25T23:00:00.000Z",
  source: "https://example.test/schedule.csv",
});

describe("sourced settlement prefill", () => {
  it("offers the current final score with provenance and a stable confirmation identity", () => {
    const candidate = settlementPrefill(input());
    expect(candidate).toMatchObject({
      homeScore: 24,
      awayScore: 21,
      source: "https://example.test/schedule.csv",
      retrievedAt: "2026-10-25T22:00:00.000Z",
    });
    expect(candidate?.identity).toMatch(/^[a-f0-9]{64}$/);
    expect(settlementPrefill(input())).toEqual(candidate);
    const changed = input();
    changed.schedule.games = [{ ...game, finalScore: { home: 20, away: 21 } }];
    expect(settlementPrefill(changed)?.identity).not.toBe(candidate?.identity);
  });

  it("has no candidate without a valid matching final game and proven later retrieval", () => {
    expect(
      settlementPrefill({
        ...input(),
        schedule: { ok: false, path: "missing.csv", reason: "missing" },
      }),
    ).toBeNull();
    for (const changed of [
      { ...game, finalScore: null },
      { ...game, home: "NYG" },
      { ...game, finalScore: { home: -1, away: 21 } },
      { ...game, finalScore: { home: 24.5, away: 21 } },
    ]) {
      const value = input();
      value.schedule.games = [changed];
      expect(settlementPrefill(value)).toBeNull();
    }
    expect(settlementPrefill({ ...input(), now: "2026-10-25T16:00:00.000Z" })).toBeNull();
    const early = input();
    early.schedule.retrievedAt = "2026-10-25T16:00:00.000Z";
    expect(settlementPrefill(early)).toBeNull();
  });
});
