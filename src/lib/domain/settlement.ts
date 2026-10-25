import type { Offer } from "#lib/domain/offer.ts";

export type FinalScore = {
  homeScore: number;
  awayScore: number;
  voided?: boolean;
};

export type Settlement = "win" | "loss" | "push" | "void" | "unresolved";

export function settleOffer(offer: Offer, score: FinalScore): Settlement {
  if (score.voided) {
    return "void";
  }
  if (!Number.isFinite(score.homeScore) || !Number.isFinite(score.awayScore)) {
    return "unresolved";
  }

  if (offer.market === "spread") {
    const selectedMargin =
      offer.selection === "home"
        ? score.homeScore - score.awayScore
        : score.awayScore - score.homeScore;
    const covered = selectedMargin + (offer.pointLine ?? 0);
    if (covered > 0) return "win";
    if (covered === 0) return "push";
    return "loss";
  }

  if (offer.market === "total") {
    const combined = score.homeScore + score.awayScore;
    const line = offer.pointLine ?? Number.NaN;
    if (combined === line) return "push";
    const over = combined > line;
    const won = offer.selection === "over" ? over : !over;
    return won ? "win" : "loss";
  }

  if (score.homeScore === score.awayScore) {
    if (offer.rules.tie === "push") return "push";
    if (offer.rules.tie === "void") return "void";
    if (offer.rules.tie === "win") return "win";
    return "loss";
  }
  const homeWon = score.homeScore > score.awayScore;
  const selectedHome = offer.selection === "home";
  return homeWon === selectedHome ? "win" : "loss";
}
