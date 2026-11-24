import { americanToDecimal, unitReturn } from "#lib/domain/odds.ts";
import { returnOnSettledStakes, type StakeResult } from "#lib/domain/performance.ts";
import type { Settlement } from "#lib/domain/settlement.ts";
import type { ActualBet, ClosingObservation, RunSummary, SettlementGrade } from "./store.ts";
import { multiclassBrier, multiclassLogLoss } from "../models/evaluate.ts";
import type { FrozenForecastRecord } from "../models/prospective.ts";
import type { Offer } from "#lib/domain/offer.ts";
import type { SavedForecast } from "./forecast-record.ts";
import type { ClosingMarketSnapshot } from "../models/protocol.ts";
import { laterNoVigBaseline } from "./closing.ts";

export function journalQualifiedForecasts(input: {
  assessments: Array<{
    id: string;
    role: string;
    offer: Offer;
    kickoffAt: string;
    forecast: SavedForecast | null;
    result: string;
  }>;
  modelPicks: Array<{
    id: string;
    offer: Offer;
    kickoffAt: string;
    forecast: SavedForecast | null;
  }>;
  bets: Array<ActualBet & { result: string }>;
  snapshots: ClosingMarketSnapshot[];
}): NonNullable<Parameters<typeof journalSummaries>[0]["qualifiedForecasts"]> {
  const outcome = (result: string): FrozenForecastRecord["outcome"] =>
    result === "win" || result === "loss" || result === "push" ? result : null;
  const record = (
    source: { offer: Offer; kickoffAt: string; forecast: SavedForecast | null },
    id: string,
    result: string,
    entryAt: string,
  ) => {
    const forecast = source.forecast;
    if (!forecast || forecast.provenance !== "captured") return [];
    return [
      {
        id,
        probabilities: forecast.probabilities,
        outcome: outcome(result),
        closingBaseline: laterNoVigBaseline({
          offer: { ...source.offer, observedAt: entryAt },
          cutoffAt: forecast.decisionCutoff,
          kickoffAt: source.kickoffAt,
          probabilities: forecast.probabilities,
          snapshots: input.snapshots,
        }),
      },
    ];
  };
  return {
    assessments: input.assessments.flatMap((row) =>
      row.role === "primary" ? record(row, row.id, row.result, row.offer.observedAt) : [],
    ),
    bets: input.bets.flatMap((bet) => {
      const source = bet.analysisId
        ? input.assessments.find((row) => row.id === bet.analysisId)
        : input.modelPicks.find((row) => row.id === bet.modelPickId);
      if (
        bet.contractProvenance !== "captured" ||
        !source ||
        !source.forecast ||
        !Number.isFinite(Date.parse(bet.placedAt)) ||
        Date.parse(bet.placedAt) < Date.parse(source.forecast.decisionCutoff) ||
        Date.parse(bet.placedAt) >= Date.parse(source.kickoffAt) ||
        !bet.rules ||
        source.offer.market !== bet.market ||
        source.offer.selection !== bet.selection ||
        source.offer.pointLine !== bet.pointLine ||
        source.offer.sportsbook !== bet.sportsbook ||
        source.offer.rules.period !== bet.rules.period ||
        source.offer.rules.overtime !== bet.rules.overtime ||
        source.offer.rules.tie !== bet.rules.tie
      )
        return [];
      return record(source, bet.id, bet.result, bet.placedAt);
    }),
  };
}

export type PerformanceCohort = "primary-assessments" | "actual-bets" | "primary-model-picks";
type UnavailableMetric = { available: false; denominator: 0; reason: string };
export type DescriptiveCohortMetrics = {
  cohort: PerformanceCohort;
  rawSameContractPriceMovement:
    | UnavailableMetric
    | {
        available: true;
        denominator: number;
        meanDecimalOddsChange: number;
      };
  twoSidedNoVigCalibration:
    | UnavailableMetric
    | {
        available: true;
        denominator: number;
        model: { brier: number; logLoss: number };
        closing: { brier: number; logLoss: number };
        meanWinProbabilityDifference: number;
        decisiveDenominator: number;
        modelWinCalibrationBias: number | null;
      };
};

export function descriptiveCohortMetrics(
  cohort: PerformanceCohort,
  movements: Array<{ id: string; difference: number }>,
  qualified: Array<
    Pick<FrozenForecastRecord, "id" | "probabilities" | "closingBaseline" | "outcome">
  >,
): DescriptiveCohortMetrics {
  const raw = [...new Map(movements.map((row) => [row.id, row.difference])).values()];
  const scored = [...new Map(qualified.map((row) => [row.id, row])).values()].filter(
    (row) => row.outcome !== null && row.closingBaseline !== null,
  );
  const average = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const decisive = scored.filter((row) => row.outcome === "win" || row.outcome === "loss");
  return {
    cohort,
    rawSameContractPriceMovement: raw.length
      ? {
          available: true,
          denominator: raw.length,
          meanDecimalOddsChange: average(raw),
        }
      : { available: false, denominator: 0, reason: "missing-comparable-closes" },
    twoSidedNoVigCalibration: scored.length
      ? {
          available: true,
          denominator: scored.length,
          model: {
            brier: average(scored.map((row) => multiclassBrier(row.probabilities, row.outcome!))),
            logLoss: average(
              scored.map((row) => multiclassLogLoss(row.probabilities, row.outcome!)),
            ),
          },
          closing: {
            brier: average(
              scored.map((row) => multiclassBrier(row.closingBaseline!, row.outcome!)),
            ),
            logLoss: average(
              scored.map((row) => multiclassLogLoss(row.closingBaseline!, row.outcome!)),
            ),
          },
          meanWinProbabilityDifference: average(
            scored.map((row) => row.probabilities.win - row.closingBaseline!.win),
          ),
          decisiveDenominator: decisive.length,
          modelWinCalibrationBias: decisive.length
            ? average(
                decisive.map((row) => row.probabilities.win - (row.outcome === "win" ? 1 : 0)),
              )
            : null,
        }
      : { available: false, denominator: 0, reason: "missing-qualified-forecast-outcomes" },
  };
}

export type ClosingState = "comparable" | "missing";

export type TrackedAssessment = {
  id: string;
  gameId: string;
  role: "primary" | "refresh";
  settlement: Settlement | "postponed";
  /** Profit on one unit when graded. Null when the result is not a settled stake. */
  unitProfit: number | null;
  closing?: ClosingState;
};

export type TrackedBet = {
  id: string;
  stakeUnits: number;
  settlement: Settlement | "postponed";
  profit: number | null;
  closing?: ClosingState;
};

export type CohortCounts = {
  settled: number;
  unresolved: number;
  push: number;
  void: number;
  missingClosing: number;
};

export type CohortSummary = {
  sample: "primary-only" | "actual-bets" | "model-picks";
  graded: number;
  unavailable: number;
  counts: CohortCounts & { primary?: number; refresh?: number; bets?: number };
  denominators: { returnOnSettledStakes: number; closingComparisons: number };
  roi: { available: true; roi: number } | { available: false; reason: string };
};

function gradedStake(
  settlement: Settlement | "postponed",
  profit: number | null,
  stake: number,
): StakeResult | null {
  if (settlement === "win" || settlement === "loss") {
    if (profit === null || !Number.isFinite(profit)) return null;
    return { profit, stake, status: "settled" };
  }
  // Push, void, postponement, and unresolved are not losses and are not a zero ROI sample.
  return null;
}

function countsFor(
  rows: Array<{ settlement: Settlement | "postponed"; closing?: ClosingState }>,
): CohortCounts {
  const counts: CohortCounts = {
    settled: 0,
    unresolved: 0,
    push: 0,
    void: 0,
    missingClosing: 0,
  };
  for (const row of rows) {
    if (row.settlement === "win" || row.settlement === "loss") counts.settled += 1;
    else if (row.settlement === "push") counts.push += 1;
    else if (row.settlement === "void") counts.void += 1;
    else counts.unresolved += 1;
    if (row.closing !== "comparable") counts.missingClosing += 1;
  }
  return counts;
}

function finished(
  sample: CohortSummary["sample"],
  stakes: StakeResult[],
  unavailable: number,
  counts: CohortSummary["counts"],
  closingComparisons: number,
): CohortSummary {
  const roi = returnOnSettledStakes(stakes);
  return {
    sample,
    graded: stakes.length,
    unavailable,
    counts,
    denominators: {
      returnOnSettledStakes: stakes.reduce((total, row) => total + row.stake, 0),
      closingComparisons,
    },
    roi: roi.available
      ? roi
      : {
          available: false,
          reason: unavailable > 0 ? "unresolved-or-missing" : roi.reason,
        },
  };
}

export function summarizePrimary(rows: TrackedAssessment[]): CohortSummary {
  const primary = rows.filter((row) => row.role === "primary");
  const stakes: StakeResult[] = [];
  let unavailable = 0;
  for (const row of primary) {
    const stake = gradedStake(row.settlement, row.unitProfit, 1);
    if (stake) stakes.push(stake);
    else unavailable += 1;
  }
  return finished(
    "primary-only",
    stakes,
    unavailable,
    {
      ...countsFor(primary),
      primary: primary.length,
      refresh: rows.filter((row) => row.role === "refresh").length,
    },
    primary.filter((row) => row.closing === "comparable").length,
  );
}

export type TrackedModelPick = {
  id: string;
  gameId: string;
  role: "primary" | "refresh";
  settlement: Settlement | "postponed";
  unitProfit: number | null;
  closing?: ClosingState;
};

export function summarizeModelPicks(rows: TrackedModelPick[]): CohortSummary {
  const primary = rows.filter((row) => row.role === "primary");
  const stakes: StakeResult[] = [];
  let unavailable = 0;
  for (const row of primary) {
    const stake = gradedStake(row.settlement, row.unitProfit, 1);
    if (stake) stakes.push(stake);
    else unavailable += 1;
  }
  return finished(
    "model-picks",
    stakes,
    unavailable,
    {
      ...countsFor(primary),
      primary: primary.length,
      refresh: rows.filter((row) => row.role === "refresh").length,
    },
    primary.filter((row) => row.closing === "comparable").length,
  );
}

export function summarizeBets(rows: TrackedBet[]): CohortSummary {
  const stakes: StakeResult[] = [];
  let unavailable = 0;
  for (const row of rows) {
    const stake = gradedStake(row.settlement, row.profit, row.stakeUnits);
    if (stake) stakes.push(stake);
    else unavailable += 1;
  }
  return finished(
    "actual-bets",
    stakes,
    unavailable,
    { ...countsFor(rows), bets: rows.length },
    rows.filter((row) => row.closing === "comparable").length,
  );
}

export type SettlementNotice = {
  id: string;
  result: Settlement | "postponed";
  reason: string | null;
  correctsId: string | null;
  duplicateOfId?: string | null;
};

/** Postponement stays unresolved. A duplicate notice is ignored. A correction keeps the prior row. */
export function applySettlementNotices(notices: SettlementNotice[]): {
  current: Settlement | "postponed" | "unresolved";
  history: SettlementNotice[];
  ignoredDuplicateIds: string[];
} {
  const history: SettlementNotice[] = [];
  const ignoredDuplicateIds: string[] = [];
  const seen = new Set<string>();
  for (const notice of notices) {
    if (notice.duplicateOfId && seen.has(notice.duplicateOfId)) {
      ignoredDuplicateIds.push(notice.id);
      continue;
    }
    if (seen.has(notice.id)) {
      ignoredDuplicateIds.push(notice.id);
      continue;
    }
    seen.add(notice.id);
    history.push(notice);
  }
  const latest = history.at(-1);
  const current = !latest
    ? "unresolved"
    : latest.result === "postponed"
      ? "unresolved"
      : latest.result;
  return { current, history, ignoredDuplicateIds };
}

export type JournalPerformance = {
  assessments: CohortSummary;
  bets: CohortSummary;
  descriptive: { assessments: DescriptiveCohortMetrics; bets: DescriptiveCohortMetrics };
};

export function profitFor(
  result: Settlement | "unresolved",
  stake: number,
  americanOdds: number,
): number | null {
  if (result !== "win" && result !== "loss" && result !== "push" && result !== "void") return null;
  return unitReturn({
    result,
    stake,
    decimalOdds: americanToDecimal(americanOdds),
  });
}

export function closingFor(
  closings: ClosingObservation[],
  kind: "analysis" | "bet" | "model-pick",
  id: string,
): ClosingState {
  const comparable = closings.some(
    (closing) =>
      closing.subject.kind === kind && closing.subject.id === id && closing.comparison.available,
  );
  return comparable ? "comparable" : "missing";
}

/** Assemble the two journal views. Refreshes stay in history and out of the primary sample. */
export function journalSummaries(input: {
  assessments: Array<RunSummary & { americanOdds: number; grade: SettlementGrade }>;
  bets: Array<ActualBet & { grade: SettlementGrade | null }>;
  closings: ClosingObservation[];
  qualifiedForecasts?: {
    assessments: Array<
      Pick<FrozenForecastRecord, "id" | "probabilities" | "closingBaseline" | "outcome">
    >;
    bets: Array<Pick<FrozenForecastRecord, "id" | "probabilities" | "closingBaseline" | "outcome">>;
  };
}): JournalPerformance {
  const trackedAssessments: TrackedAssessment[] = input.assessments
    .filter((row) => row.assessmentRole.role === "primary" || row.assessmentRole.role === "refresh")
    .map((row) => {
      const role = row.assessmentRole.role === "refresh" ? "refresh" : "primary";
      const result = row.grade.effective;
      return {
        id: row.id,
        gameId: row.game.id,
        role,
        settlement: result === "unresolved" ? "unresolved" : result,
        unitProfit: role === "primary" ? profitFor(result, 1, row.americanOdds) : null,
        closing: closingFor(input.closings, "analysis", row.id),
      };
    });
  const trackedBets: TrackedBet[] = input.bets.map((bet) => {
    const result = bet.grade?.effective ?? "unresolved";
    return {
      id: bet.id,
      stakeUnits: bet.stakeUnits,
      settlement: result,
      profit:
        bet.market && bet.selection ? profitFor(result, bet.stakeUnits, bet.americanOdds) : null,
      closing: closingFor(input.closings, "bet", bet.id),
    };
  });
  return {
    assessments: summarizePrimary(trackedAssessments),
    bets: summarizeBets(trackedBets),
    descriptive: {
      assessments: descriptiveCohortMetrics(
        "primary-assessments",
        comparableMovements(
          input.closings,
          "analysis",
          new Set(trackedAssessments.filter((row) => row.role === "primary").map((row) => row.id)),
        ),
        (input.qualifiedForecasts?.assessments ?? []).filter((row) =>
          trackedAssessments.some(
            (assessment) => assessment.id === row.id && assessment.role === "primary",
          ),
        ),
      ),
      bets: descriptiveCohortMetrics(
        "actual-bets",
        comparableMovements(input.closings, "bet", new Set(trackedBets.map((row) => row.id))),
        (input.qualifiedForecasts?.bets ?? []).filter((row) =>
          trackedBets.some((bet) => bet.id === row.id),
        ),
      ),
    },
  };
}

function comparableMovements(
  closings: ClosingObservation[],
  kind: ClosingObservation["subject"]["kind"],
  ids: Set<string>,
) {
  return [...closings]
    .sort(
      (a, b) =>
        Date.parse(a.observedAt ?? "") - Date.parse(b.observedAt ?? "") || a.id.localeCompare(b.id),
    )
    .flatMap((row) =>
      row.subject.kind === kind && ids.has(row.subject.id) && row.comparison.available
        ? [{ id: row.subject.id, difference: row.comparison.difference }]
        : [],
    );
}
