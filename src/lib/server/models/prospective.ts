import type { OutcomeProbabilities } from "../../domain/odds.ts";
import { multiclassBrier, multiclassLogLoss, type Outcome } from "./evaluate.ts";
import type { Market } from "./games.ts";
import { clusteredInterval, UNCERTAINTY_OPTIONS } from "./uncertainty.ts";
import { RELEASE_GATE, type EvaluationProtocol, type MarketRelease } from "./release.ts";

/** A forecast saved at decision time. Evaluation must not replace these probabilities. */
export type FrozenForecastRecord = {
  id: string;
  decisionCutoff: string;
  artifactChecksum: string;
  market: Market;
  /** Probabilities saved for the researched side. */
  probabilities: OutcomeProbabilities;
  /** No-vig closing comparison for the same side. Not an executable offer. */
  closingBaseline: OutcomeProbabilities | null;
  /** Timestamped executable offer, when one was recorded. Not used as the close. */
  executableOfferAt: string | null;
  slate: string;
  outcome: Outcome | null;
};

export type ProspectiveMarketResult = {
  market: Market;
  pricedGames: number;
  missingObservations: number;
  unresolved: number;
  model: { brier: number; logLoss: number } | null;
  closing: { brier: number; logLoss: number } | null;
  logLossDifferenceInterval: [number, number] | null;
  provenance: "frozen-decision-time-forecasts";
  release: MarketRelease;
};

export type ProspectiveEvaluation = {
  protocolId: string;
  role: "prospective";
  sample: number;
  missingObservations: number;
  markets: Record<Market, ProspectiveMarketResult>;
  /** Eligibility is not a profitability claim. */
  profitability: null;
};

const MARKETS: readonly Market[] = ["moneyline", "spread", "total"];

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scores(
  records: readonly FrozenForecastRecord[],
  probability: (record: FrozenForecastRecord) => OutcomeProbabilities,
): { brier: number; logLoss: number } | null {
  const settled = records.filter((record) => record.outcome !== null);
  const brier = average(
    settled.map((record) => multiclassBrier(probability(record), record.outcome!)),
  );
  const logLoss = average(
    settled.map((record) => multiclassLogLoss(probability(record), record.outcome!)),
  );
  if (brier === null || logLoss === null) return null;
  return { brier, logLoss };
}

function differenceInterval(records: readonly FrozenForecastRecord[]): [number, number] | null {
  const bySlate = new Map<string, number[]>();
  for (const record of records) {
    if (record.outcome === null || record.closingBaseline === null) continue;
    const difference =
      multiclassLogLoss(record.probabilities, record.outcome) -
      multiclassLogLoss(record.closingBaseline, record.outcome);
    bySlate.set(record.slate, [...(bySlate.get(record.slate) ?? []), difference]);
  }
  return clusteredInterval(
    [...bySlate.values()],
    (sample) => {
      const all = sample.flat();
      return all.length === 0 ? null : all.reduce((sum, value) => sum + value, 0) / all.length;
    },
    UNCERTAINTY_OPTIONS,
  );
}

function judge(
  market: Market,
  model: { brier: number; logLoss: number } | null,
  closing: { brier: number; logLoss: number } | null,
  count: number,
  interval: [number, number] | null,
  protocol: EvaluationProtocol,
): MarketRelease {
  const problems: string[] = [];
  if (model === null || closing === null) {
    problems.push("missing metrics");
  }
  if (count < protocol.minimumPricedGames) {
    problems.push(
      `only ${count} priced prospective games, fewer than ${protocol.minimumPricedGames}`,
    );
  }
  if (model && closing && model.logLoss > closing.logLoss) {
    problems.push(
      `log loss ${model.logLoss.toFixed(4)} is worse than the close's ${closing.logLoss.toFixed(4)}`,
    );
  }
  if (model && closing && model.brier > closing.brier) {
    problems.push(
      `Brier ${model.brier.toFixed(4)} is worse than the close's ${closing.brier.toFixed(4)}`,
    );
  }
  if (!interval) {
    problems.push("the slate-clustered 90% log-loss difference interval is unavailable");
  } else if (interval[1] > 0) {
    problems.push(
      `the log-loss difference interval upper endpoint ${interval[1].toFixed(4)} is above zero`,
    );
  }
  if (problems.length === 0) {
    return {
      released: true,
      reason: `No worse than the closing comparison on ${count} priced prospective games, with a log-loss difference interval at or below zero. This is release eligibility, not a profitability claim.`,
    };
  }
  return { released: false, reason: `Not released: ${problems.join("; ")}.` };
}

/**
 * Score forecasts saved at decision time. Later artifacts, schedules, and scores are not inputs.
 * `executableOfferAt` is reported as provenance and is not substituted for a missing close.
 */
export function evaluateProspectiveForecasts(
  protocol: EvaluationProtocol,
  records: readonly FrozenForecastRecord[],
): ProspectiveEvaluation {
  const unique = new Map<string, FrozenForecastRecord>();
  for (const record of records) {
    for (const probabilities of [record.probabilities, record.closingBaseline]) {
      if (probabilities === null) continue;
      const values = [probabilities.win, probabilities.loss, probabilities.push];
      if (
        values.some((value) => !Number.isFinite(value) || value < 0 || value > 1) ||
        Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 1e-9
      ) {
        throw new Error(`Invalid prospective probabilities for ${record.id}.`);
      }
    }
    const prior = unique.get(record.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(record)) {
      throw new Error(`Conflicting prospective forecast identifier: ${record.id}`);
    }
    unique.set(record.id, record);
  }
  const qualified = [...unique.values()].filter((record) => {
    const cutoff = Date.parse(record.decisionCutoff);
    const start = Date.parse(protocol.period.start);
    const end = protocol.period.end === null ? Infinity : Date.parse(protocol.period.end);
    return Number.isFinite(cutoff) && Number.isFinite(start) && cutoff >= start && cutoff < end;
  });
  const markets = {} as Record<Market, ProspectiveMarketResult>;
  for (const market of MARKETS) {
    const members = qualified.filter(
      (record) => record.market === market && record.artifactChecksum === protocol.artifactChecksum,
    );
    const mismatched = qualified.filter(
      (record) => record.market === market && record.artifactChecksum !== protocol.artifactChecksum,
    );
    const settled = members.filter(
      (record) => record.outcome !== null && record.closingBaseline !== null,
    );
    const missingObservations = members.filter((record) => record.closingBaseline === null).length;
    const unresolved = members.filter((record) => record.outcome === null).length;
    const model = scores(settled, (record) => record.probabilities);
    const closing = scores(settled, (record) => record.closingBaseline ?? record.probabilities);
    const interval = differenceInterval(settled);
    const release =
      mismatched.length > 0 && members.length === 0
        ? {
            released: false,
            reason: `Not released: ${mismatched.length} ${market} forecasts belong to a different artifact.`,
          }
        : judge(market, model, closing, settled.length, interval, protocol);
    markets[market] = {
      market,
      pricedGames: settled.length,
      missingObservations,
      unresolved,
      model,
      closing,
      logLossDifferenceInterval: interval,
      provenance: "frozen-decision-time-forecasts",
      release,
    };
  }
  return {
    protocolId: protocol.id,
    role: "prospective",
    sample: qualified.length,
    missingObservations: MARKETS.reduce(
      (sum, market) => sum + markets[market].missingObservations,
      0,
    ),
    markets,
    profitability: null,
  };
}

export function protocolForArtifact(checksum: string): EvaluationProtocol {
  return {
    id: "prospective-2026-10-26",
    role: "independent",
    artifactChecksum: checksum,
    inputAvailability: "decision-time-starters-v1",
    markets: ["moneyline", "spread", "total"],
    period: { start: "2026-10-26T00:00:00Z", end: null },
    minimumPricedGames: RELEASE_GATE.minimumPricedGames,
    uncertainty: "slate-clustered-90-log-loss-difference",
    criteria: "no-worse-brier-and-log-loss-and-interval-upper-at-most-zero",
    frozenBeforeOutcomes: true,
  };
}
