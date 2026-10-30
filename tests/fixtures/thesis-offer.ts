import { parseOffer } from "#lib/domain/offer.ts";

export const thesisGame = {
  id: "fixture-game",
  home: "PHI",
  away: "DAL",
  kickoff: "2026-10-25T20:00:00.000Z",
};

export const thesisOffer = parseOffer({
  gameId: thesisGame.id,
  sportsbook: "Fixture Book",
  market: "moneyline",
  selection: "home",
  americanOdds: -150,
  observedAt: "2026-10-25T18:00:00.000Z",
  kickoffAt: thesisGame.kickoff,
  rules: { period: "full-game", overtime: "included", tie: "push" },
});
