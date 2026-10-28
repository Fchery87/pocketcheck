import { describe, expect, it } from "vite-plus/test";
import { buildFeatureRows } from "../../src/lib/server/models/features.ts";
import { fitRidge, predictMean, walkForwardResiduals } from "../../src/lib/server/models/fit.ts";
import type { PricedGame } from "../../src/lib/server/models/games.ts";
import { fitArtifact } from "../../src/lib/server/models/train.ts";

// A deterministic league of 8 teams over 60 games with noisy scores.
function league(count: number): PricedGame[] {
  const games: CompletedGame[] = [];
  let seed = 7;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let index = 0; index < count; index += 1) {
    const home = index % 8;
    const away = (index * 3 + 1) % 8 === home ? (home + 1) % 8 : (index * 3 + 1) % 8;
    const kickoff = new Date(Date.UTC(2024, 8, 1) + index * 86_400_000).toISOString();
    games.push({
      id: `g${String(index).padStart(3, "0")}`,
      kickoff,
      home: `T${home}`,
      away: `T${away}`,
      homeScore: Math.round(14 + home * 2 + next() * 20),
      awayScore: Math.round(14 + away * 2 + next() * 20),
      prices: {
        spread: { line: 0, home: { american: -110 }, away: { american: -110 } },
        total: {
          line: 44,
          over: { american: -110 },
          under: { american: -110 },
        },
      },
    });
  }
  return games;
}

describe("walk-forward residuals", () => {
  const games = league(60);
  const rows = buildFeatureRows(games);
  const targets = games.map((game) => game.homeScore - game.awayScore);

  it("scores each later block with a model fit only on the blocks before it", () => {
    const residuals = walkForwardResiduals(rows, targets, 1, 4);
    // Four blocks of 15: the first block only trains, so 45 residuals remain.
    expect(residuals).toHaveLength(45);
    // The 45th result becomes eligible exactly at the block cutoff, so it stays excluded.
    const earlier = fitRidge(rows.slice(0, 44), targets.slice(0, 44), 1);
    const last = rows[59]!;
    expect(residuals[44]).toBeCloseTo((targets[59] ?? 0) - predictMean(earlier, last), 10);
  });

  it("is at least as wide as the in-sample residuals the old fit used", () => {
    const outOfSample = walkForwardResiduals(rows, targets, 1, 4);
    const inSampleModel = fitRidge(rows, targets, 1);
    const inSample = rows.map(
      (row, index) => (targets[index] ?? 0) - predictMean(inSampleModel, row),
    );
    const meanSquare = (values: number[]) =>
      values.reduce((sum, value) => sum + value * value, 0) / values.length;
    expect(meanSquare(outOfSample)).toBeGreaterThan(meanSquare(inSample));
  });

  it("records where an artifact's residuals came from", () => {
    expect(fitArtifact(games, games[49]!.kickoff).residualSource).toBe("walk-forward");
    const tiny = games.slice(0, 4);
    expect(fitArtifact(tiny, tiny[3]!.kickoff).residualSource).toBe("in-sample");
  });
});
