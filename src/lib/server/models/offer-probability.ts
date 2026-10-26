import type { OutcomeProbabilities } from "../../domain/odds.ts";
import type { Offer } from "../../domain/offer.ts";
import type { GameProbabilities } from "./predict.ts";

type OfferTerms = Pick<Offer, "market" | "selection" | "pointLine"> & {
  rules: Pick<Offer["rules"], "tie">;
};

/** Win, loss, and push for the recorded offer: its market, side, line, and tie rule. */
export function offerProbabilities(
  predicted: GameProbabilities,
  offer: OfferTerms,
): OutcomeProbabilities {
  if (offer.market === "moneyline") {
    const side = offer.selection === "away" ? predicted.moneyline.away : predicted.moneyline.home;
    // A void tie returns the stake, which settles like a push.
    if (offer.rules.tie === "loss") return { win: side.win, loss: side.loss + side.push, push: 0 };
    if (offer.rules.tie === "win") return { win: side.win + side.push, loss: side.loss, push: 0 };
    return { ...side };
  }
  if (offer.pointLine === null) {
    throw new Error(`A ${offer.market} offer needs a line to price.`);
  }
  if (offer.market === "spread") {
    // The line belongs to the selected side. An away line of +3 is a home line of -3.
    return offer.selection === "away"
      ? { ...predicted.spread(-offer.pointLine).away }
      : { ...predicted.spread(offer.pointLine).home };
  }
  const total = predicted.total(offer.pointLine);
  return offer.selection === "under" ? { ...total.under } : { ...total.over };
}
