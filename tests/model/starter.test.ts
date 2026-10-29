import { describe, expect, it } from "vite-plus/test";
import {
  recentStarter,
  starterAssumption,
  starterDecision,
  type InjuryDesignation,
} from "../../src/lib/server/models/starter.ts";
import type { DepthChartEntry } from "../../src/lib/server/sources/roster.ts";

const chart = (
  depth: number,
  playerId: string,
  updatedAt: string | null,
  season = 2025,
): DepthChartEntry => ({
  season,
  team: "PHI",
  position: "QB",
  depth,
  playerId,
  player: playerId,
  updatedAt,
});

const injury = (playerId: string, status: string, publishedAt: string): InjuryDesignation => ({
  team: "PHI",
  playerId,
  status,
  publishedAt,
});

const decide = (over: Partial<Parameters<typeof starterDecision>[0]> = {}) =>
  starterDecision({
    team: "PHI",
    season: 2025,
    cutoff: "2025-09-28T16:00:00Z",
    usualStarter: "hurts",
    depthChart: [
      chart(1, "hurts", "2025-09-27T12:00:00Z"),
      chart(2, "backup", "2025-09-27T12:00:00Z"),
    ],
    injuries: [],
    ...over,
  });

describe("starter state", () => {
  it("treats a timestamped depth chart as a known starter", () => {
    expect(decide()).toMatchObject({
      state: "known",
      playerId: "hurts",
      source: "depth chart",
    });
  });

  it("moves to the backup when the usual starter is out before the cutoff", () => {
    const decision = decide({
      injuries: [injury("hurts", "Out", "2025-09-27T18:00:00Z")],
    });
    expect(decision).toMatchObject({
      state: "assumed",
      playerId: "backup",
      source: "injury report",
    });
  });

  it("ignores a designation published after the cutoff", () => {
    const decision = decide({
      injuries: [injury("hurts", "Out", "2025-09-28T18:00:00Z")],
    });
    expect(decision.playerId).toBe("hurts");
  });

  it("is unknown when the depth chart and the injury report disagree", () => {
    const decision = decide({
      depthChart: [
        chart(1, "third", "2025-09-27T12:00:00Z"),
        chart(2, "backup", "2025-09-27T12:00:00Z"),
      ],
      injuries: [injury("hurts", "Doubtful", "2025-09-27T18:00:00Z")],
    });
    expect(decision.state).toBe("unknown");
  });

  it("falls back to the assumed starter before depth charts were timestamped", () => {
    const decision = decide({
      season: 2024,
      depthChart: [chart(1, "hurts", null, 2024)],
    });
    expect(decision).toMatchObject({
      state: "assumed",
      source: "recent starts",
    });
  });

  it("is unknown with no history and no timestamped chart", () => {
    expect(decide({ usualStarter: null, depthChart: [] }).state).toBe("unknown");
  });
});

describe("recent starter", () => {
  const game = (day: number, home: string, away: string, homeQb?: string, awayQb?: string) => ({
    kickoff: `2025-09-${String(day).padStart(2, "0")}T17:00:00Z`,
    home,
    away,
    homeQb,
    awayQb,
  });

  it("is the most frequent starter before the cutoff and the date of the latest start", () => {
    const history = [
      game(7, "PHI", "DAL", "hurts", "prescott"),
      game(14, "NYG", "PHI", "jones", "backup"),
      game(21, "PHI", "WAS", "hurts", "daniels"),
      game(28, "PHI", "LAR", "hurts", "stafford"),
    ];
    expect(recentStarter(history, "PHI", "2025-09-27T00:00:00Z")).toEqual({
      playerId: "hurts",
      at: "2025-09-21T17:00:00Z",
    });
  });

  it("ignores a game that kicked off at or after the cutoff and games with no recorded starter", () => {
    expect(
      recentStarter([game(28, "PHI", "LAR", "hurts")], "PHI", "2025-09-28T17:00:00Z"),
    ).toBeNull();
    expect(recentStarter([game(7, "PHI", "DAL")], "PHI", "2025-09-30T00:00:00Z")).toBeNull();
  });
});

describe("starter assumption record", () => {
  it("stamps a starter assumed from history with its latest start and keeps the source", () => {
    const decision = starterDecision({
      team: "PHI",
      season: 2024,
      cutoff: "2024-09-28T16:00:00Z",
      usualStarter: "hurts",
      depthChart: [],
      injuries: [],
    });
    expect(starterAssumption(decision, "2024-09-22T17:00:00Z")).toEqual({
      state: "assumed",
      identity: "hurts",
      evidenceAt: "2024-09-22T17:00:00Z",
      source: "recent starts",
    });
  });

  it("keeps the reason an unknown starter is unknown", () => {
    const decision = starterDecision({
      team: "PHI",
      season: 2025,
      cutoff: "2025-09-28T16:00:00Z",
      usualStarter: null,
      depthChart: [],
      injuries: [],
    });
    expect(starterAssumption(decision, null)).toEqual({
      state: "unknown",
      identity: null,
      evidenceAt: null,
      source: null,
      reason: "No starter is known.",
    });
  });
});
