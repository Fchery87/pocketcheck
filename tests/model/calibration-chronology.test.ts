import { describe, expect, it } from "vite-plus/test";
import { fitArtifact } from "../../src/lib/server/models/train.ts";
import type { PricedGame } from "../../src/lib/server/models/games.ts";

describe("walk-forward calibration chronology", () => {
  it.each(["spread", "total"] as const)(
    "keeps earlier %s calibration unchanged by later results",
    (market) => {
      const games: PricedGame[] = Array.from({ length: 150 }, (_, index) => ({
        id: `game-${index}`,
        kickoff: new Date(Date.UTC(2020, 0, 1) + index * 7 * 86_400_000).toISOString(),
        home: `home-${index}`,
        away: `away-${index}`,
        homeScore: 16 + (index % 15),
        awayScore: 12 + (index % 7),
        prices: {
          moneyline: { home: { american: -150 }, away: { american: 130 } },
          ...(market !== "spread" || index < 75
            ? { spread: { line: -3, home: { american: -110 }, away: { american: -110 } } }
            : {}),
          ...(market !== "total" || index < 75
            ? { total: { line: 44.5, over: { american: -110 }, under: { american: -110 } } }
            : {}),
        },
      }));
      const changed = games.map((game, index) =>
        index >= 100 ? { ...game, homeScore: game.homeScore + 50 } : game,
      );
      const cutoff = new Date(Date.parse(games.at(-1)!.kickoff) + 3 * 86_400_000).toISOString();
      const original = fitArtifact(games, cutoff).uncertainty.markets[market];
      expect(original.some((bin) => bin.sides > 0)).toBe(true);
      expect(fitArtifact(changed, cutoff).uncertainty.markets[market]).toEqual(original);
    },
    60_000,
  );

  it("does not shift margin calibration when total histories are filtered differently", () => {
    const games: PricedGame[] = Array.from({ length: 150 }, (_, index) => ({
      id: `game-${index}`,
      kickoff: new Date(Date.UTC(2020, 0, 1) + index * 7 * 86_400_000).toISOString(),
      home: `home-${index}`,
      away: `away-${index}`,
      homeScore: 16 + (index % 15),
      awayScore: 12 + (index % 7),
      prices: {
        moneyline: { home: { american: -150 }, away: { american: 130 } },
        ...(index % 5 === 0
          ? {}
          : { spread: { line: -3, home: { american: -110 }, away: { american: -110 } } }),
        total: { line: 44.5, over: { american: -110 }, under: { american: -110 } },
      },
    }));
    const partial = games.map((game, index) => ({
      ...game,
      prices: { ...game.prices, ...(index % 3 === 0 ? { total: undefined } : {}) },
    }));
    const cutoff = new Date(Date.parse(games.at(-1)!.kickoff) + 3 * 86_400_000).toISOString();
    const original = fitArtifact(games, cutoff).uncertainty.markets;
    const filtered = fitArtifact(partial, cutoff).uncertainty.markets;
    expect(filtered.moneyline).toEqual(original.moneyline);
    expect(filtered.spread).toEqual(original.spread);
    expect(filtered.total.some((bin) => bin.sides > 0)).toBe(true);
  }, 60_000);

  it("does not change earlier moneyline calibration when later game scores change", () => {
    const games: PricedGame[] = Array.from({ length: 150 }, (_, index) => ({
      id: `game-${index}`,
      kickoff: new Date(Date.UTC(2020, 0, 1) + index * 7 * 86_400_000).toISOString(),
      home: `home-${index}`,
      away: `away-${index}`,
      homeScore: 16 + (index % 15),
      awayScore: 12 + (index % 7),
      prices: {
        ...(index < 75
          ? { moneyline: { home: { american: -150 }, away: { american: 130 } } }
          : { spread: { line: -3, home: { american: -110 }, away: { american: -110 } } }),
        total: { line: 44.5, over: { american: -110 }, under: { american: -110 } },
      },
    }));
    const changed = games.map((game, index) =>
      index >= 100 ? { ...game, homeScore: game.homeScore + 50 } : game,
    );
    const cutoff = new Date(Date.parse(games.at(-1)!.kickoff) + 3 * 86_400_000).toISOString();
    const original = fitArtifact(games, cutoff).uncertainty.markets.moneyline;
    const after = fitArtifact(changed, cutoff).uncertainty.markets.moneyline;
    expect(original.some((bin) => bin.sides > 0)).toBe(true);
    expect(after).toEqual(original);
  }, 60_000);
});
