import { describe, expect, it } from "vite-plus/test";
import {
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
  week: 4,
  team: "PHI",
  position: "QB",
  depth,
  playerId,
  player: playerId,
  updatedAt,
});

const injury = (
  playerId: string,
  status: string,
  publishedAt: string,
): InjuryDesignation => ({
  team: "PHI",
  playerId,
  status,
  publishedAt,
});

const decide = (over: Partial<Parameters<typeof starterDecision>[0]> = {}) =>
  starterDecision({
    team: "PHI",
    season: 2025,
    week: 4,
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
    expect(decide({ usualStarter: null, depthChart: [] }).state).toBe(
      "unknown",
    );
  });
});
