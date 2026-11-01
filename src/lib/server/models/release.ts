import type { EvaluationSummary } from "./evaluate.ts";
import { evaluateProspectiveForecasts } from "./prospective.ts";
import { buildProspectiveSample } from "../analysis/prospective-sample.ts";
import type { JournalExport } from "../analysis/journal-backup.ts";
import type { Market } from "./games.ts";
import { artifactChecksum, datasetHash, type ModelArtifact } from "./artifact.ts";
import { isDeepStrictEqual } from "node:util";
import type { ProtocolRegistration } from "./protocol.ts";
import type { ProspectiveEvaluation } from "./prospective.ts";

export type ReleaseAttestation = {
  kind: "pocketcheck-release-attestation";
  version: 1;
  artifactChecksum: string;
  registration: ProtocolRegistration;
  releasedMarkets: Market[];
  evidence: { checksum: string; journal: JournalExport };
  evaluation: ProspectiveEvaluation;
  checksum: string;
};

const verified = new WeakMap<object, { artifactChecksum: string; markets: readonly Market[] }>();
declare const verification: unique symbol;
export type VerifiedReleaseAttestation = Readonly<{
  checksum: string;
  artifactChecksum: string;
  releasedMarkets: readonly Market[];
  readonly [verification]: true;
}>;

export function hasVerifiedRelease(
  value: VerifiedReleaseAttestation | undefined,
  checksum: string | undefined,
  market: Market,
): boolean {
  const binding = value && verified.get(value);
  return !!binding && binding.artifactChecksum === checksum && binding.markets.includes(market);
}

export function verifyReleaseAttestation(
  artifact: ModelArtifact,
  value: unknown,
): VerifiedReleaseAttestation {
  if (!value || typeof value !== "object" || !("registration" in value) || !("evidence" in value))
    throw new Error("A complete release attestation is required.");
  const candidate = value as ReleaseAttestation;
  if (
    candidate.kind !== "pocketcheck-release-attestation" ||
    candidate.version !== 1 ||
    !candidate.evidence?.journal ||
    typeof candidate.registration?.id !== "string"
  )
    throw new Error("A complete version 1 release attestation is required.");
  const expected = releaseFromJournal({
    artifact,
    journal: candidate.evidence?.journal,
    registrationId: candidate.registration?.id,
  });
  if (!isDeepStrictEqual(candidate, expected))
    throw new Error("Release attestation evidence, identity, or verdict was altered.");
  const capability = Object.freeze({
    checksum: expected.checksum,
    artifactChecksum: artifact.checksum,
    releasedMarkets: Object.freeze([...expected.releasedMarkets]),
  }) as VerifiedReleaseAttestation;
  verified.set(capability, {
    artifactChecksum: artifact.checksum,
    markets: capability.releasedMarkets,
  });
  return capability;
}

function freezeEvidence<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeEvidence);
    Object.freeze(value);
  }
  return value;
}

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
  inputAvailability: "decision-time-starters-v1",
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
}): ReleaseAttestation {
  const { checksum, ...predictor } = input.artifact;
  if (artifactChecksum(predictor) !== checksum)
    throw new Error("The predictive artifact checksum is invalid.");
  const journal = structuredClone(input.journal);
  const sample = buildProspectiveSample({
    journal,
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
  const body: Omit<ReleaseAttestation, "checksum"> = {
    kind: "pocketcheck-release-attestation",
    version: 1,
    artifactChecksum: checksum,
    registration: sample.protocol,
    releasedMarkets,
    evidence: { checksum: datasetHash(journal), journal },
    evaluation,
  };
  return freezeEvidence({ ...body, checksum: datasetHash(body) });
}
