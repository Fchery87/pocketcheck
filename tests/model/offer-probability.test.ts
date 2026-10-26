import { describe, expect, it } from "vite-plus/test";
import type { MassBin } from "../../src/lib/server/models/distribution.ts";
import {
  moneylineFromMargin,
  spreadFromMargin,
  totalFromDistribution,
} from "../../src/lib/server/models/distribution.ts";
import { buildFeatureRows, featureRowForGame } from "../../src/lib/server/models/features.ts";
import type { CompletedGame } from "../../src/lib/server/models/games.ts";
import { offerProbabilities } from "../../src/lib/server/models/offer-probability.ts";
import type { GameProbabilities } from "../../src/lib/server/models/predict.ts";

// Home margin: -3 (20%), 0 (10%), 3 (30%), 7 (40%). Total: 41 (50%), 47 (50%).
const marginBins: MassBin[] = [
  { points: -3, probability: 0.2 },
  { points: 0, probability: 0.1 },
  { points: 3, probability: 0.3 },
  { points: 7, probability: 0.4 },
];
const totalBins: MassBin[] = [
  { points: 41, probability: 0.5 },
  { points: 47, probability: 0.5 },
];
const predicted: GameProbabilities = {
  gameId: "g",
  marginMean: 3,
  totalMean: 44,
  marginBins,
  totalBins,
  moneyline: moneylineFromMargin(marginBins),
  spread: (line) => spreadFromMargin(marginBins, line),
  total: (line) => totalFromDistribution(totalBins, line),
};

const offer = (
  market: "moneyline" | "spread" | "total",
  selection: string,
  pointLine: number | null,
  tie: string | null = null,
) => ({ market, selection, pointLine, rules: { tie } }) as Parameters<typeof offerProbabilities>[1];

describe("probabilities for the recorded offer", () => {
  it("settles a moneyline tie by the offer's tie rule", () => {
    expect(offerProbabilities(predicted, offer("moneyline", "home", null, "push"))).toEqual({
      win: 0.7,
      loss: 0.2,
      push: 0.1,
    });
    expect(offerProbabilities(predicted, offer("moneyline", "away", null, "void"))).toEqual({
      win: 0.2,
      loss: 0.7,
      push: 0.1,
    });
    const tieLoses = offerProbabilities(predicted, offer("moneyline", "home", null, "loss"));
    expect(tieLoses.win).toBeCloseTo(0.7, 12);
    expect(tieLoses.loss).toBeCloseTo(0.3, 12);
    expect(tieLoses.push).toBe(0);
    expect(offerProbabilities(predicted, offer("moneyline", "away", null, "win")).win).toBeCloseTo(
      0.3,
      12,
    );
  });

  it("reads a spread from the selected side's own line", () => {
    // Home -3 pushes on a 3-point win. Away +3 is the same bet from the other side.
    expect(offerProbabilities(predicted, offer("spread", "home", -3))).toEqual({
      win: 0.4,
      loss: 0.30000000000000004,
      push: 0.3,
    });
    const away = offerProbabilities(predicted, offer("spread", "away", 3));
    expect(away.win).toBeCloseTo(0.3, 12);
    expect(away.loss).toBeCloseTo(0.4, 12);
    expect(away.push).toBeCloseTo(0.3, 12);
  });

  it("reads a total from the over or under", () => {
    expect(offerProbabilities(predicted, offer("total", "over", 44.5))).toEqual({
      win: 0.5,
      loss: 0.5,
      push: 0,
    });
    expect(offerProbabilities(predicted, offer("total", "under", 47)).push).toBe(0.5);
  });

  it("refuses a spread or total without a line", () => {
    expect(() => offerProbabilities(predicted, offer("spread", "home", null))).toThrow(/line/);
  });
});

describe("a feature row for an upcoming game", () => {
  const history: CompletedGame[] = [
    {
      id: "a",
      kickoff: "2024-09-08T17:00:00Z",
      home: "A",
      away: "B",
      homeScore: 24,
      awayScore: 10,
    },
    {
      id: "b",
      kickoff: "2024-09-15T17:00:00Z",
      home: "B",
      away: "A",
      homeScore: 13,
      awayScore: 20,
    },
  ];
  const upcoming = { id: "next", kickoff: "2024-09-22T17:00:00Z", home: "A", away: "B" };

  it("matches the row the game would get as part of the history", () => {
    const asHistory = buildFeatureRows([...history, { ...upcoming, homeScore: 0, awayScore: 0 }]);
    expect(featureRowForGame(history, upcoming)).toEqual(asHistory.at(-1));
  });

  it("ignores history at or after the game's kickoff", () => {
    const later: CompletedGame = {
      id: "z",
      kickoff: "2024-09-29T17:00:00Z",
      home: "A",
      away: "B",
      homeScore: 50,
      awayScore: 0,
    };
    expect(featureRowForGame([...history, later], upcoming)).toEqual(
      featureRowForGame(history, upcoming),
    );
  });
});
