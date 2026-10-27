import type { EvidenceCollector } from "#lib/server/analysis/evidence.ts";
import type { ModelSource, RunModel } from "#lib/server/analysis/model.ts";
import type { OutcomeProbabilities } from "#lib/domain/odds.ts";

/** No automatic gaps, so the grade depends only on the prices and the model. */
export const quiet: EvidenceCollector = async () => ({ items: [], gaps: [], materialGaps: [] });

function flip(probabilities: OutcomeProbabilities): OutcomeProbabilities {
  return { win: probabilities.loss, loss: probabilities.win, push: probabilities.push };
}

/** A scripted forecasting model: home probabilities, mirrored for the away side. */
export function scriptedModel(input: {
  home: OutcomeProbabilities;
  conservativeHome?: OutcomeProbabilities;
  conservativeAway?: OutcomeProbabilities;
  released?: boolean;
  trainingCutoff?: string;
}): ModelSource & { offers: string[] } {
  const offers: string[] = [];
  const source = async (_game: unknown, _cutoff: string, offer: { selection: string }) => {
    offers.push(offer.selection);
    const home = offer.selection === "home";
    const conservative = home ? input.conservativeHome : input.conservativeAway;
    const model: RunModel = {
      status: "computed",
      artifact: {
        checksum: "f".repeat(64),
        version: 4,
        trainingCutoff: input.trainingCutoff ?? "2026-03-01T00:00:00.000Z",
        releaseStatus: input.released ? "released-experimental" : "unreleased",
        releasedMarkets: input.released ? ["moneyline"] : [],
      },
      probabilities: home ? input.home : flip(input.home),
      uncertainty: conservative
        ? { available: true, confidence: 0.9, probabilities: conservative }
        : { available: false, reason: "Too few calibration sides." },
      eligible: input.released ?? false,
      reason: input.released
        ? "Released for moneyline."
        : "Unreleased artifacts are not eligible for a value recommendation.",
      protocol: {
        id: "prospective-2026-10-26",
        role: "independent",
        blockingReason: "Independent prospective evidence is missing.",
      },
    };
    return model;
  };
  return Object.assign(source as ModelSource, { offers });
}
