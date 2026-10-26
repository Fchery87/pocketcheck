import { withChecksum, type ModelArtifact } from "./artifact.ts";
import type { EvaluationReport, EvaluationSummary } from "./evaluate.ts";
import type { Market } from "./games.ts";

/**
 * A market is released only when the model is no worse than the no-vig closing price on both
 * log loss and Brier, over enough priced holdout games. Beating the training base rate does not
 * count, because a model can do that while still losing to the price it would bet against.
 */
export const RELEASE_GATE = {
  minimumPricedGames: 500,
};

export type MarketRelease = { released: boolean; reason: string };

const MARKETS: readonly Market[] = ["moneyline", "spread", "total"];

export function releaseDecision(
  summary: EvaluationSummary,
  gate = RELEASE_GATE,
): Record<Market, MarketRelease> {
  const decision = {} as Record<Market, MarketRelease>;
  for (const market of MARKETS) {
    const comparison = summary.baselines.find(
      (entry) => entry.market === market && entry.name === "market-no-vig",
    );
    if (!comparison) {
      decision[market] = {
        released: false,
        reason: `There are no priced ${market} holdout games.`,
      };
      continue;
    }
    const { count, model, baseline } = comparison;
    const problems: string[] = [];
    if (count < gate.minimumPricedGames) {
      problems.push(`only ${count} priced holdout games, fewer than ${gate.minimumPricedGames}`);
    }
    if (model.logLoss > baseline.logLoss) {
      problems.push(
        `log loss ${model.logLoss.toFixed(4)} is worse than the market's ${baseline.logLoss.toFixed(4)}`,
      );
    }
    if (model.brier > baseline.brier) {
      problems.push(
        `Brier ${model.brier.toFixed(4)} is worse than the market's ${baseline.brier.toFixed(4)}`,
      );
    }
    decision[market] =
      problems.length === 0
        ? {
            released: true,
            reason: `No worse than the no-vig closing price on ${count} priced holdout games.`,
          }
        : { released: false, reason: `Not released: ${problems.join("; ")}.` };
  }
  return decision;
}

/** Releases the markets that pass the gate, using an evaluation of this exact artifact. */
export function releaseArtifact(artifact: ModelArtifact, report: EvaluationReport): ModelArtifact {
  if (report.artifactChecksum !== artifact.checksum) {
    throw new Error("The evaluation is of a different artifact. Evaluate this artifact first.");
  }
  const decision = releaseDecision(report.summary);
  const releasedMarkets = MARKETS.filter((market) => decision[market].released);
  if (releasedMarkets.length === 0) {
    const reasons = MARKETS.map((market) => `${market}: ${decision[market].reason}`).join(" ");
    throw new Error(`No market passed the release gate. ${reasons}`);
  }
  const { checksum: _previous, ...body } = artifact;
  return withChecksum({ ...body, releaseStatus: "released-experimental", releasedMarkets });
}
