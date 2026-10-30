import type { OutcomeProbabilities } from "../../domain/odds.ts";
import type { Market } from "./games.ts";

/** One side of one game, forecast walk-forward inside the training window. */
export type CalibrationSample = {
  market: Market;
  slate: string;
  /** Model win probability given a decisive result: win / (win + loss). */
  decisiveWin: number;
  outcome: "win" | "loss" | "push";
};

export type CalibrationBin = {
  lower: number;
  upper: number;
  /** Decisive sides in the bin. */
  sides: number;
  slates: number;
  meanPredicted: number | null;
  observedRate: number | null;
  /** Lower end of the slate-clustered bootstrap interval of observedRate. */
  conservativeRate: number | null;
};

export const UNCERTAINTY_OPTIONS = {
  binWidth: 0.05,
  confidence: 0.9,
  resamples: 1000,
  seed: 20261025,
  minimumSides: 60,
};

export type ArtifactUncertainty = {
  calibrationVersion?: "anchored-v1";
  method: "walk-forward-calibration";
  options: typeof UNCERTAINTY_OPTIONS;
  markets: Record<Market, CalibrationBin[]>;
};

export type UncertaintyAssessment =
  | { available: true; confidence: number; probabilities: OutcomeProbabilities }
  | { available: false; reason: string };

const MARKETS: readonly Market[] = ["moneyline", "spread", "total"];

/**
 * The NFL week a kickoff belongs to: the Tuesday that starts it, on the Eastern calendar.
 * A Monday night game stays in its week even when it is already Tuesday in UTC.
 */
export function slateOf(kickoff: string): string {
  const eastern = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(kickoff));
  const part = (type: Intl.DateTimeFormatPartTypes) => {
    const value = eastern.find((entry) => entry.type === type)?.value;
    if (!value) throw new Error(`Kickoff has no ${type}: ${kickoff}`);
    return Number(value);
  };
  const date = new Date(part("year"), part("month") - 1, part("day"));
  const daysSinceTuesday = (date.getDay() + 5) % 7;
  date.setDate(date.getDate() - daysSinceTuesday);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Percentile interval of a statistic when whole clusters are resampled with replacement, so
 * results that share a cluster (a slate) move together.
 */
export function clusteredInterval<T>(
  clusters: readonly T[],
  statistic: (sample: readonly T[]) => number | null,
  options: { resamples: number; seed: number; confidence: number },
): [number, number] | null {
  if (clusters.length < 2) return null;
  const random = mulberry32(options.seed);
  const values: number[] = [];
  for (let resample = 0; resample < options.resamples; resample += 1) {
    const sample = Array.from(
      { length: clusters.length },
      () => clusters[Math.floor(random() * clusters.length)]!,
    );
    const value = statistic(sample);
    if (value !== null && Number.isFinite(value)) values.push(value);
  }
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  const tail = (1 - options.confidence) / 2;
  const at = (quantile: number) =>
    values[Math.min(values.length - 1, Math.max(0, Math.floor(quantile * values.length)))]!;
  return [at(tail), at(1 - tail)];
}

type SlateTally = { wins: number; sides: number };

function rate(sample: readonly SlateTally[]): number | null {
  const sides = sample.reduce((sum, slate) => sum + slate.sides, 0);
  return sides === 0 ? null : sample.reduce((sum, slate) => sum + slate.wins, 0) / sides;
}

export function fitUncertainty(
  samples: readonly CalibrationSample[],
  options = UNCERTAINTY_OPTIONS,
): ArtifactUncertainty {
  const count = Math.round(1 / options.binWidth);
  const markets = {} as Record<Market, CalibrationBin[]>;
  for (const market of MARKETS) {
    const decisive = samples.filter(
      (sample) => sample.market === market && sample.outcome !== "push",
    );
    markets[market] = Array.from({ length: count }, (_, index) => {
      const lower = Number((index * options.binWidth).toFixed(4));
      const upper = Number(((index + 1) * options.binWidth).toFixed(4));
      const members = decisive.filter(
        (sample) =>
          Math.min(count - 1, Math.floor(sample.decisiveWin / options.binWidth)) === index,
      );
      const bySlate = new Map<string, SlateTally>();
      for (const member of members) {
        const tally = bySlate.get(member.slate) ?? { wins: 0, sides: 0 };
        tally.sides += 1;
        if (member.outcome === "win") tally.wins += 1;
        bySlate.set(member.slate, tally);
      }
      const clusters = [...bySlate.values()];
      const interval = clusteredInterval(clusters, rate, {
        ...options,
        seed: options.seed + index,
      });
      return {
        lower,
        upper,
        sides: members.length,
        slates: clusters.length,
        meanPredicted:
          members.length === 0
            ? null
            : members.reduce((sum, member) => sum + member.decisiveWin, 0) / members.length,
        observedRate: rate(clusters),
        conservativeRate: interval ? interval[0] : null,
      };
    });
  }
  return { method: "walk-forward-calibration", options, markets };
}

/** The offer's probabilities moved to the lower calibration bound of their bin. */
export function conservativeProbabilities(
  uncertainty: ArtifactUncertainty,
  market: Market,
  probabilities: OutcomeProbabilities,
): UncertaintyAssessment {
  const decisive = probabilities.win + probabilities.loss;
  if (!(decisive > 0)) {
    return { available: false, reason: "The offer has no decisive outcome to assess." };
  }
  const q = probabilities.win / decisive;
  const bins = uncertainty.markets[market];
  const bin = bins[Math.min(bins.length - 1, Math.floor(q / uncertainty.options.binWidth))];
  const minimum = uncertainty.options.minimumSides;
  if (!bin || bin.sides < minimum || bin.conservativeRate === null || bin.meanPredicted === null) {
    return {
      available: false,
      reason: `Training produced ${bin?.sides ?? 0} walk-forward ${market} forecasts near a ${(q * 100).toFixed(1)}% decisive win probability, fewer than ${minimum}, so its uncertainty cannot be assessed.`,
    };
  }
  const conservative = Math.min(q, Math.max(0, bin.conservativeRate + (q - bin.meanPredicted)));
  return {
    available: true,
    confidence: uncertainty.options.confidence,
    probabilities: {
      win: conservative * decisive,
      loss: (1 - conservative) * decisive,
      push: probabilities.push,
    },
  };
}
