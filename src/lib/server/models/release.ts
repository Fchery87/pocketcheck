import type { EvaluationReport, EvaluationSummary } from "./evaluate.ts";
import type { ProspectiveEvaluation } from "./prospective.ts";
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
  criteria:
    "no-worse-brier-and-log-loss-and-interval-upper-at-most-zero" as const,
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
      problems.push(
        `only ${count} priced holdout games, fewer than ${gate.minimumPricedGames}`,
      );
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

export type ProtocolRelease = {
  released: boolean;
  protocolId: string;
  reasons: string[];
  markets: Record<Market, MarketRelease>;
  profitability: null;
};

/**
 * Development holdout results cannot satisfy the independent protocol.
 * Missing prospective observations block release.
 */
export function releaseUnderProtocol(input: {
  artifact: ModelArtifact;
  protocol: EvaluationProtocol;
  development: { role: "development"; summary: EvaluationSummary } | null;
  prospective: ProspectiveEvaluation | null;
}): ProtocolRelease {
  if (input.protocol.artifactChecksum !== input.artifact.checksum) {
    return {
      released: false,
      protocolId: input.protocol.id,
      reasons: [
        "The protocol artifact does not match the artifact being released.",
      ],
      markets: blocked("The protocol artifact does not match this artifact."),
      profitability: null,
    };
  }
  if (!input.protocol.frozenBeforeOutcomes) {
    return {
      released: false,
      protocolId: input.protocol.id,
      reasons: [
        "The protocol was not frozen before its outcomes were inspected.",
      ],
      markets: blocked(
        "The protocol was not frozen before outcome inspection.",
      ),
      profitability: null,
    };
  }
  if (!input.prospective) {
    return {
      released: false,
      protocolId: input.protocol.id,
      reasons: [
        `Protocol ${input.protocol.id} has no independent prospective evaluation.`,
        "The inspected historical holdout is development evidence and cannot release a market.",
      ],
      markets: releaseDecision(input.development?.summary ?? emptySummary()),
      profitability: null,
    };
  }
  if (input.prospective.protocolId !== input.protocol.id) {
    return {
      released: false,
      protocolId: input.protocol.id,
      reasons: [
        `Prospective results are for protocol ${input.prospective.protocolId}, not ${input.protocol.id}. Changing frozen rules requires a new protocol identity.`,
      ],
      markets: blocked("Prospective results belong to a different protocol."),
      profitability: null,
    };
  }
  const markets = {} as Record<Market, MarketRelease>;
  for (const market of MARKETS) {
    markets[market] = input.prospective.markets[market]?.release ?? {
      released: false,
      reason: `Not released: missing prospective results for ${market}.`,
    };
  }
  const released = MARKETS.some((market) => markets[market].released);
  return {
    released,
    protocolId: input.protocol.id,
    reasons: MARKETS.filter((market) => !markets[market].released).map(
      (market) => `${market}: ${markets[market].reason}`,
    ),
    markets,
    profitability: null,
  };
}

function blocked(reason: string): Record<Market, MarketRelease> {
  return {
    moneyline: { released: false, reason },
    spread: { released: false, reason },
    total: { released: false, reason },
  };
}

function emptySummary(): EvaluationSummary {
  return {
    count: 0,
    brier: 0,
    logLoss: 0,
    calibration: [],
    baselines: [],
    coverage: { priced: 0, missingPrices: 0 },
    byMarket: {},
    threshold: {
      version: "",
      conservativeExpectedValue: 0,
      note: "",
      markets: {
        moneyline: emptyThreshold(),
        spread: emptyThreshold(),
        total: emptyThreshold(),
      },
    },
  };
}

function emptyThreshold() {
  return {
    assessed: 0,
    candidates: 0,
    decisive: 0,
    wins: 0,
    observedRate: null,
    meanBreakEven: null,
    interval: null,
  };
}

/** Writes a released artifact only when an independent prospective protocol passes. */
export function releaseArtifact(
  artifact: ModelArtifact,
  report: EvaluationReport,
  prospective: {
    protocol: EvaluationProtocol;
    evaluation: ProspectiveEvaluation;
  } | null = null,
): ModelArtifact {
  if (report.artifactChecksum !== artifact.checksum) {
    throw new Error(
      "The evaluation is of a different artifact. Evaluate this artifact first.",
    );
  }
  const decision = releaseUnderProtocol({
    artifact,
    protocol: prospective?.protocol ?? {
      ...PROSPECTIVE_PROTOCOL,
      artifactChecksum: artifact.checksum,
    },
    development: { role: "development", summary: report.summary },
    prospective: prospective?.evaluation ?? null,
  });
  const releasedMarkets = MARKETS.filter(
    (market) => decision.markets[market].released,
  );
  if (!decision.released || releasedMarkets.length === 0) {
    const reasons = decision.reasons.join(" ");
    throw new Error(
      `No market passed the release gate. Independent prospective evidence is missing or failed. ${reasons}`,
    );
  }
  const { checksum: _previous, ...body } = artifact;
  return withChecksum({
    ...body,
    releaseStatus: "released-experimental",
    releasedMarkets,
  });
}
