import type { Market } from "#lib/domain/offer.ts";
import type { Outcome } from "../models/evaluate.ts";
import type { FrozenForecastRecord } from "../models/prospective.ts";
import type { ListedModelPick } from "./board-store.ts";
import type { StrengthGrade } from "./model-pick.ts";
import type { ClosingObservation } from "./store.ts";
import {
  closingFor,
  profitFor,
  summarizeModelPicks,
  type CohortSummary,
  type TrackedModelPick,
} from "./summary.ts";

const MARKETS: readonly Market[] = ["moneyline", "spread", "total"];
const GRADES: readonly StrengthGrade[] = ["strong", "lean", "no edge"];

export type ModelPickRow = {
  pickId: string;
  boardId: string;
  game: string;
  market: Market;
  grade: StrengthGrade;
  release: "released" | "unvalidated";
  selection: string;
  pointLine: number | null;
  americanOdds: number;
  result: "win" | "loss" | "push" | "void" | "unresolved";
  /** Profit on one unit at the picked contract. Null unless the pick settled as a win or loss. */
  unitProfit: number | null;
  /** The latest comparable close, else the latest attempt, else missing. Never a zero move. */
  closing:
    | { state: "comparable"; difference: number }
    | { state: "line-movement"; openPointLine: number | null; closePointLine: number | null }
    | { state: "unavailable"; reason: string }
    | { state: "missing" };
};

/** Model-pick performance, kept apart from assessments and actual bets. */
export type ModelPickPerformance = {
  /** Primary model picks only, in the order their boards finished. */
  rows: ModelPickRow[];
  overall: CohortSummary;
  byMarket: Record<Market, CohortSummary>;
  byGrade: Record<StrengthGrade, CohortSummary>;
  /** Primary picks grouped by the artifact that produced them. A missing checksum stays unknown. */
  byArtifact: { checksum: string; summary: CohortSummary }[];
  /** Picks left out of the sample, so a smaller sample is never a silent one. */
  excluded: { withdrawn: number; refresh: number; ineligible: number; unclassified: number };
};

function trackedRole(listed: ListedModelPick): "primary" | "refresh" | null {
  if (listed.withdrawn) return null;
  const role = listed.pick.role.role;
  return role === "primary" || role === "refresh" ? role : null;
}

function closingState(closings: ClosingObservation[], pickId: string): ModelPickRow["closing"] {
  const mine = closings.filter(
    (closing) => closing.subject.kind === "model-pick" && closing.subject.id === pickId,
  );
  if (mine.length === 0) return { state: "missing" };
  const comparable = mine.filter((closing) => closing.comparison.available).at(-1);
  if (comparable?.comparison.available) {
    return { state: "comparable", difference: comparable.comparison.difference };
  }
  const last = mine.at(-1)!.comparison;
  if (last.available) return { state: "missing" };
  if (last.lineMovement) {
    return {
      state: "line-movement",
      openPointLine: last.lineMovement.openPointLine,
      closePointLine: last.lineMovement.closePointLine,
    };
  }
  return { state: "unavailable", reason: last.reason };
}

export function modelPickPerformance(
  picks: ListedModelPick[],
  closings: ClosingObservation[],
): ModelPickPerformance {
  const tracked = picks.flatMap((listed) => {
    const role = trackedRole(listed);
    if (!role) return [];
    const result = listed.grade.effective;
    const row: TrackedModelPick & { market: Market; grade: StrengthGrade; checksum: string } = {
      id: listed.pick.id,
      gameId: listed.game.id,
      role,
      settlement: result,
      unitProfit: role === "primary" ? profitFor(result, 1, listed.offer.americanOdds) : null,
      closing: closingFor(closings, "model-pick", listed.pick.id),
      market: listed.pick.market,
      grade: listed.pick.calculation.grade,
      checksum: listed.pick.forecastingModel.checksum || "unknown",
    };
    return [row];
  });
  const slice = (keep: (row: (typeof tracked)[number]) => boolean) =>
    summarizeModelPicks(tracked.filter(keep));
  const kept = picks.filter((listed) => !listed.withdrawn);
  const rows = kept.flatMap((listed): ModelPickRow[] => {
    if (listed.pick.role.role !== "primary") return [];
    const result = listed.grade.effective;
    return [
      {
        pickId: listed.pick.id,
        boardId: listed.pick.boardId,
        game: `${listed.game.away} at ${listed.game.home}`,
        market: listed.pick.market,
        grade: listed.pick.calculation.grade,
        release: listed.pick.calculation.release,
        selection: listed.offer.selection,
        pointLine: listed.offer.pointLine,
        americanOdds: listed.offer.americanOdds,
        result,
        unitProfit: profitFor(result, 1, listed.offer.americanOdds),
        closing: closingState(closings, listed.pick.id),
      },
    ];
  });
  return {
    rows,
    overall: slice(() => true),
    byMarket: Object.fromEntries(
      MARKETS.map((market) => [market, slice((row) => row.market === market)]),
    ) as Record<Market, CohortSummary>,
    byGrade: Object.fromEntries(
      GRADES.map((grade) => [grade, slice((row) => row.grade === grade)]),
    ) as Record<StrengthGrade, CohortSummary>,
    byArtifact: [...new Set(tracked.map((row) => row.checksum))].sort().map((checksum) => ({
      checksum,
      summary: slice((row) => row.checksum === checksum),
    })),
    excluded: {
      withdrawn: picks.length - kept.length,
      refresh: kept.filter((item) => item.pick.role.role === "refresh").length,
      ineligible: kept.filter((item) => item.pick.role.role === "ineligible").length,
      unclassified: kept.filter((item) => item.pick.role.role === "unclassified").length,
    },
  };
}

function outcomeOf(result: ModelPickRow["result"]): Outcome | null {
  return result === "win" || result === "loss" || result === "push" ? result : null;
}

/**
 * The frozen forecasts of primary model picks as prospective evaluation records. Probabilities are
 * read from the saved forecast, never regenerated, and the outcome is only attached from the
 * grade. A primary pick without a captured forecast has no record.
 */
export function prospectiveForecastRecords(picks: ListedModelPick[]): FrozenForecastRecord[] {
  return picks.flatMap((listed) => {
    const role = listed.pick.role;
    const forecast = listed.pick.forecast;
    if (listed.withdrawn || role.role !== "primary" || !forecast) return [];
    return [
      {
        id: listed.pick.id,
        decisionCutoff: forecast.decisionCutoff,
        artifactChecksum: forecast.artifact.checksum,
        market: listed.pick.market,
        probabilities: forecast.probabilities,
        // A single-sided close is not a no-vig baseline, so none is claimed.
        closingBaseline: null,
        executableOfferAt: listed.observedAt,
        slate: `${listed.game.season}-${listed.game.week}`,
        outcome: outcomeOf(listed.grade.effective),
      },
    ];
  });
}
