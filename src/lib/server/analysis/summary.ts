import { returnOnSettledStakes, type StakeResult } from "#lib/domain/performance.ts";
import type { Settlement } from "#lib/domain/settlement.ts";

export type TrackedAssessment = {
  id: string;
  gameId: string;
  role: "primary" | "refresh";
  settlement: Settlement | "postponed";
  /** Profit on one unit when graded. Null when the result is not a settled stake. */
  unitProfit: number | null;
};

export type TrackedBet = {
  id: string;
  stakeUnits: number;
  settlement: Settlement | "postponed";
  profit: number | null;
};

export type CohortSummary = {
  sample: "primary-only" | "actual-bets";
  graded: number;
  unavailable: number;
  roi: { available: true; roi: number } | { available: false; reason: string };
};

function gradedStake(settlement: Settlement | "postponed", profit: number | null, stake: number): StakeResult | null {
  if (settlement === "win" || settlement === "loss") {
    if (profit === null || !Number.isFinite(profit)) return null;
    return { profit, stake, status: "settled" };
  }
  // Push, void, postponement, and unresolved are not losses and are not a zero ROI sample.
  return null;
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
  const roi = returnOnSettledStakes(stakes);
  return {
    sample: "primary-only",
    graded: stakes.length,
    unavailable,
    roi: roi.available ? roi : { available: false, reason: unavailable > 0 ? "unresolved-or-missing" : roi.reason },
  };
}

export function summarizeBets(rows: TrackedBet[]): CohortSummary {
  const stakes: StakeResult[] = [];
  let unavailable = 0;
  for (const row of rows) {
    const stake = gradedStake(row.settlement, row.profit, row.stakeUnits);
    if (stake) stakes.push(stake);
    else unavailable += 1;
  }
  const roi = returnOnSettledStakes(stakes);
  return {
    sample: "actual-bets",
    graded: stakes.length,
    unavailable,
    roi: roi.available ? roi : { available: false, reason: unavailable > 0 ? "unresolved-or-missing" : roi.reason },
  };
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
  const current = !latest ? "unresolved" : latest.result === "postponed" ? "unresolved" : latest.result;
  return { current, history, ignoredDuplicateIds };
}
