import { describe, expect, it } from "vite-plus/test";
import { offerProbabilities } from "../../src/lib/server/models/offer-probability.ts";
import { predictGame } from "../../src/lib/server/models/predict.ts";
import {
  freezeProspectiveForecast,
  replayProspectiveForecast,
  type ProspectiveForecast,
} from "../../src/lib/server/models/forecast.ts";
import { fitArtifact } from "../../src/lib/server/models/train.ts";
import type { CompletedGame } from "../../src/lib/server/models/games.ts";
import type { Offer } from "../../src/lib/domain/offer.ts";

function played(
  id: string,
  kickoff: string,
  home: string,
  away: string,
  homeQb: string,
): CompletedGame {
  return { id, kickoff, home, away, homeScore: 24, awayScore: 17, homeQb, awayQb: `${away}-qb` };
}

const history = [
  played("h1", "2024-09-08T17:00:00Z", "PHI", "DAL", "hurts"),
  played("h2", "2024-09-15T17:00:00Z", "PHI", "ATL", "hurts"),
  played("h3", "2024-09-22T17:00:00Z", "PHI", "NO", "hurts"),
];

const offer = {
  gameId: "next",
  sportsbook: "Book",
  market: "moneyline",
  selection: "home",
  pointLine: null,
  americanOdds: -110,
  decimalOdds: 1.9090909090909092,
  observedAt: "2024-09-28T16:00:00.000Z",
  enteredAt: "2024-09-28T16:00:00.000Z",
  kickoffAt: "2024-09-29T17:00:00.000Z",
  rules: { period: "full-game", overtime: "included", tie: "push" },
} satisfies Offer;

const artifact = fitArtifact(history, "2024-09-24T00:00:00.000Z");
const cutoff = "2024-09-28T16:00:00.000Z";

describe("frozen prospective forecasts", () => {
  it("does not treat an archived actual starter as a known live input", () => {
    const archived = {
      id: "next",
      season: 2024,
      kickoff: "2024-09-29T17:00:00.000Z",
      home: "PHI",
      away: "TB",
      homeQb: "hurts",
      awayQb: "mayfield",
    };
    const frozen = freezeProspectiveForecast({
      artifact,
      history,
      game: archived,
      cutoff,
      offer,
      policyVersion: "policy-2026-10-25.2",
    });

    expect(frozen.starters.home).toEqual({ state: "unknown", identity: null, evidenceAt: null });
    expect(frozen.starters.away).toEqual({ state: "unknown", identity: null, evidenceAt: null });
    expect(frozen.features.home_qb_share).toBeCloseTo(1);
    expect(frozen.decisionCutoff).toBe(cutoff);
    expect(frozen.artifact).toEqual({
      checksum: artifact.checksum,
      version: artifact.version,
    });
    expect(frozen.policyVersion).toBe("policy-2026-10-25.2");
    expect(frozen.marketEligibility).toEqual({
      market: "moneyline",
      eligible: false,
    });
    expect(frozen.probabilities.win + frozen.probabilities.loss + frozen.probabilities.push).toBeCloseTo(
      1,
    );
  });

  it("keeps the saved forecast after the current schedule, artifact, starters, and score change", () => {
    const game = {
      id: "next",
      kickoff: "2024-09-29T17:00:00.000Z",
      home: "PHI",
      away: "TB",
      starters: {
        home: { state: "assumed" as const, identity: "hurts", evidenceAt: cutoff },
        away: { state: "known" as const, identity: "mayfield", evidenceAt: "2024-09-28T12:00:00.000Z" },
      },
    };
    const original: ProspectiveForecast = freezeProspectiveForecast({
      artifact,
      history,
      game,
      cutoff,
      offer,
      policyVersion: "policy-2026-10-25.2",
    });
    const replacement = fitArtifact(
      [...history, { ...history[0]!, id: "late", homeScore: 3, awayScore: 40, kickoff: "2024-09-27T17:00:00.000Z" }],
      "2024-09-28T18:00:00.000Z",
    );
    const replayed = replayProspectiveForecast(original, {
      artifact: replacement,
      history: history.map((row) => ({ ...row, homeQb: "backup", homeScore: 0 })),
      game: {
        ...game,
        kickoff: "2024-09-30T20:00:00.000Z",
        homeScore: 31,
        awayScore: 10,
        starters: {
          home: { state: "known", identity: "backup", evidenceAt: "2024-09-29T15:00:00.000Z" },
          away: { state: "known", identity: "backup", evidenceAt: "2024-09-29T15:00:00.000Z" },
        },
      },
      cutoff: "2024-09-29T18:00:00.000Z",
      offer: { ...offer, americanOdds: 150, decimalOdds: 2.5 },
      policyVersion: "policy-later",
    });

    expect(replayed).toEqual(original);
    expect(original.starters.home.state).toBe("assumed");
    expect(original.starters.away).toMatchObject({
      state: "known",
      identity: "mayfield",
      evidenceAt: "2024-09-28T12:00:00.000Z",
    });
    const live = offerProbabilities(
      predictGame(artifact, {
        gameId: game.id,
        kickoff: game.kickoff,
        features: original.features,
      }),
      offer,
    );
    expect(original.probabilities).toEqual(live);
  });
});
