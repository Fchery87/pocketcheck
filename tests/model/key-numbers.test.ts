import { describe, expect, it } from "vite-plus/test";
import {
  integerMass,
  keyNumberWeights,
  type ResidualDistribution,
} from "../../src/lib/server/models/distribution.ts";
import { buildFeatureRows } from "../../src/lib/server/models/features.ts";
import type { CompletedGame } from "../../src/lib/server/models/games.ts";
import { predictGame } from "../../src/lib/server/models/predict.ts";
import { fitArtifact } from "../../src/lib/server/models/train.ts";

/** Scores built from touchdowns and field goals, with ties settled by a field goal. */
function footballLeague(count: number): CompletedGame[] {
  let seed = 11;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const score = () => 7 * Math.floor(next() * 5) + 3 * Math.floor(next() * 3);
  return Array.from({ length: count }, (_, index) => {
    const home = index % 10;
    const away = (home + 1 + (index % 9)) % 10;
    let homeScore = score();
    const awayScore = score();
    if (homeScore === awayScore) homeScore += 3;
    return {
      id: `g${String(index).padStart(4, "0")}`,
      kickoff: new Date(Date.UTC(2020, 8, 1) + index * 3_600_000 * 20).toISOString(),
      home: `T${home}`,
      away: `T${away}`,
      homeScore,
      awayScore,
    };
  });
}

function weightAt(weights: ReturnType<typeof keyNumberWeights>, points: number): number {
  return weights.find((entry) => entry.points === points)?.weight ?? 1;
}

describe("key-number weights", () => {
  it("lifts margins that happen more often than a smooth curve says and lowers ties", () => {
    const margins = footballLeague(3000).map((game) => game.homeScore - game.awayScore);
    const weights = keyNumberWeights(margins);
    expect(weightAt(weights, 3)).toBeGreaterThan(1.2);
    expect(weightAt(weights, -3)).toBe(weightAt(weights, 3));
    expect(weightAt(weights, 7)).toBeGreaterThan(1.2);
    expect(weightAt(weights, 0)).toBeLessThan(0.2);
  });

  it("stays near 1 when there are too few games to tell", () => {
    const weights = keyNumberWeights([3, -7, 10, 14, -3, 6, 1, -4]);
    for (const entry of weights) {
      expect(entry.weight).toBeGreaterThan(0.6);
      expect(entry.weight).toBeLessThan(1.4);
    }
  });

  it("reweights integer bins and keeps them a distribution", () => {
    const smooth: ResidualDistribution = {
      residuals: [-6, -3, 0, 3, 6],
      bandwidth: 3,
      support: { min: -30, max: 30 },
      keyWeights: [],
    };
    const keyed = {
      ...smooth,
      keyWeights: [
        { points: 3, weight: 2 },
        { points: 0, weight: 0.1 },
      ],
    };
    const mass = (bins: ReturnType<typeof integerMass>, points: number) =>
      bins.find((bin) => bin.points === points)?.probability ?? 0;
    const plain = integerMass(smooth, 2);
    const weighted = integerMass(keyed, 2);
    expect(weighted.reduce((sum, bin) => sum + bin.probability, 0)).toBeCloseTo(1, 10);
    expect(mass(weighted, 3) / mass(weighted, 4)).toBeCloseTo(
      (2 * mass(plain, 3)) / mass(plain, 4),
      10,
    );
    expect(mass(weighted, 0)).toBeLessThan(mass(plain, 0));
  });
});

describe("fitted margins", () => {
  it("put realistic mass on ties and on a field-goal margin", () => {
    const games = footballLeague(1200);
    const artifact = fitArtifact(games, games[999]!.kickoff);
    const row = buildFeatureRows(games, artifact.featureParameters).at(-1)!;
    const bins = predictGame(artifact, row).marginBins;
    const at = (points: number) => bins.find((bin) => bin.points === points)?.probability ?? 0;
    expect(at(0)).toBeLessThan(0.01);
    expect(at(3)).toBeGreaterThan(at(2));
    expect(at(3)).toBeGreaterThan(at(5));
    expect(artifact.total.residuals.keyWeights).toEqual([]);
  });
});
