import type { EvaluationSummary } from "./evaluate.ts";
import { evaluateProspectiveForecasts } from "./prospective.ts";
import { buildProspectiveSample } from "../analysis/prospective-sample.ts";
import type { JournalExport } from "../db/repository.ts";
import { INPUT_AVAILABILITY } from "./forecast.ts";
import type { Market } from "./games.ts";
import { withChecksum, type ModelArtifact } from "./artifact.ts";

/**
 * A market is released only when the model is no worse than the no-vig closing price on both
 * log loss and Brier, over enough priced games, and the slate-clustered 90% log-loss difference
 * interval has an upper endpoint at most zero. Beating the training base rate does not count.
 *
 * Historical holdout comparisons are development evidence. They do not release a market.
 * Release needs an independent prospective protocol frozen before its outcomes are inspected.
 */
export const RELEASE_GATE = {
  minimumPricedGames: 500,
};

export const PROSPECTIVE_PROTOCOL = {
  id: "prospective-2026-10-26",
  role: "independent" as const,
  inputAvailability: INPUT_AVAILABILITY.version,
  markets: ["moneyline", "spread", "total"] as const,
  period: { start: "2026-10-26T00:00:00Z", end: null as string | null },
  minimumPricedGames: RELEASE_GATE.minimumPricedGames,
  uncertainty: "slate-clustered-90-log-loss-difference" as const,
  criteria: "no-worse-brier-and-log-loss-and-interval-upper-at-most-zero" as const,
  frozenBeforeOutcomes: true,
};

export type EvaluationProtocol = {
  id: string;
  role: "independent";
  artifactChecksum: string;
  inputAvailability: string;
  markets: readonly Market[];
  period: { start: string; end: string | null };
  minimumPricedGames: number;
  uncertainty: typeof PROSPECTIVE_PROTOCOL.uncertainty;
  criteria: typeof PROSPECTIVE_PROTOCOL.criteria;
  frozenBeforeOutcomes: boolean;
};

export type MarketRelease = { released: boolean; reason: string };

const MARKETS: readonly Market[] = ["moneyline", "spread", "total"];

/** Development comparison against the no-vig close. A clean comparison is still not a release. */
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
            released: false,
            reason: `Development evidence only: no worse than the no-vig closing price on ${count} priced holdout games. This inspected holdout is not an independent protocol and does not release the market.`,
          }
        : { released: false, reason: `Not released: ${problems.join("; ")}.` };
  }
  return decision;
}

export function releaseFromJournal(input: {
  artifact: ModelArtifact;
  journal: JournalExport;
  registrationId: string;
}): ModelArtifact {
  if (input.artifact.uncertainty.calibrationVersion !== "anchored-v1") {
    throw new Error("This artifact needs a refit with anchored calibration before release.");
  }
  const sample = buildProspectiveSample({
    journal: input.journal,
    registrationId: input.registrationId,
  });
  const protocol = sample.protocol.protocol;
  if (
    protocol.id !== PROSPECTIVE_PROTOCOL.id ||
    protocol.artifactChecksum !== input.artifact.checksum ||
    protocol.period.start !== PROSPECTIVE_PROTOCOL.period.start ||
    protocol.period.end !== PROSPECTIVE_PROTOCOL.period.end ||
    protocol.inputAvailability !== PROSPECTIVE_PROTOCOL.inputAvailability ||
    protocol.minimumPricedGames !== PROSPECTIVE_PROTOCOL.minimumPricedGames ||
    protocol.uncertainty !== PROSPECTIVE_PROTOCOL.uncertainty ||
    protocol.criteria !== PROSPECTIVE_PROTOCOL.criteria
  ) {
    throw new Error(
      "The registered evidence does not match the required frozen release protocol and artifact.",
    );
  }
  const evaluation = evaluateProspectiveForecasts(protocol, sample.records);
  const releasedMarkets = MARKETS.filter((market) => evaluation.markets[market].release.released);
  if (releasedMarkets.length === 0)
    throw new Error("No market passed the prospective release gate.");
  const { checksum: _previous, ...body } = input.artifact;
  return withChecksum({ ...body, releaseStatus: "released-experimental", releasedMarkets });
}
