# Release Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Before any market can produce an "experimental value candidate", PocketCheck must (1) assess the uncertainty of the model's probability, accounting for games on the same slate, (2) compare a conservative expected value with a frozen, versioned threshold, and (3) let manual evidence clear a material gap only when it is tagged to that gap and fresh, with the reliance shown in the report and the journal.

**Architecture:** At fit time, the artifact records a walk-forward calibration table per market, with a slate-clustered bootstrap lower bound per probability bin. The holdout is never inspected. At run time, the model source turns the offer's probabilities into conservative probabilities from that table. The value policy calls a market a candidate only when the point expected value is positive _and_ the conservative expected value clears a threshold frozen in a domain module. Separately, material gaps become typed (`injury-report`, `weather`), manual evidence can carry a `covers` tag, and a pure coverage rule decides which gaps a fresh tagged item clears. The decision records that reliance.

**Tech Stack:** TypeScript 6 (Node strip-types for scripts), SvelteKit 3 with Svelte 5 runes, Vite+ (`vp test`, `vp check`), postgres.js on Neon, Playwright.

---

## Decisions this plan encodes

| #   | Decision                                                                                                                                                                                                                                                                                             | Why                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Uncertainty is a **walk-forward calibration table** stored in the artifact: per market, 20 bins of decisive win probability, each with sides, slates, mean predicted, observed rate, and a **conservative rate** (the lower end of a 90% interval).                                                  | The spec requires calibration and uncertainty policy to be fit "without inspecting held-out outcomes". Walk-forward forecasts inside the training window satisfy that, and the table is transparent and reproducible.                                     |
| D2  | The interval is a **slate-clustered bootstrap**: a slate is the NFL week (the Tuesday that starts it, in Eastern time), and each slate's results are resampled together. The seed and resample count are stored.                                                                                     | Spec line 134 requires accounting for "shared-game or slate dependence". Both sides of a game, and games in the same week, are not independent.                                                                                                           |
| D3  | Conservative decisive win probability = `min(q, conservativeRate + (q − meanPredicted))` for the offer's bin. A bin with fewer than 60 decisive sides gives "uncertainty unavailable".                                                                                                               | Uses the bin's observed calibration, keeps the offer's position within the bin, and never exceeds the model's own estimate.                                                                                                                               |
| D4  | `VALUE_THRESHOLD = { version: "threshold-2026-10-25", conservativeExpectedValue: 0 }` lives in a **domain module** shared by the policy and the evaluation. It is frozen in code, and evaluation only _reports_ how it would have behaved.                                                           | Spec line 136: "Thresholds must be evaluated and versioned rather than selected for persuasive output." Fixing it before looking, then reporting, is the honest order. The uncertainty is the margin, so the threshold on the conservative estimate is 0. |
| D5  | Policy ladder for a released, eligible market: point EV ≤ 0 → **pass**; uncertainty unavailable → **insufficient evidence**; conservative EV ≤ threshold → **experimental lean**; otherwise → **experimental value candidate**. `POLICY_VERSION` becomes `policy-2026-10-25.2`.                      | Today a non-positive EV returns "experimental lean", which is backwards. A bet without positive expected value at the recorded price is a pass.                                                                                                           |
| D6  | The price cutoff ("the price that would change the conclusion") is computed from the **conservative** probabilities and the threshold.                                                                                                                                                               | It must match what the conclusion actually depends on.                                                                                                                                                                                                    |
| D7  | Material gaps become `{ kind: "injury-report" \| "weather"; text }`. Manual evidence may carry `covers: kind`, stored in its `facts`. A tagged item clears its gap only if its source time is known, not after the cutoff, and within **24 h** (injury report) or **12 h** (forecast) of the cutoff. | This is the user's choice: "Only if tagged and fresh". Storing `covers` in `facts` means refreshes and export/restore carry it with no migration.                                                                                                         |
| D8  | The decision records `manualCoverage` and `reliesOnManualEvidence`. The report and the journal list show it.                                                                                                                                                                                         | The user's choice: reliance is labeled in report and journal. The policy JSON column already persists, so no migration is needed.                                                                                                                         |
| D9  | No new migration. The uncertainty lives in the artifact, the conservative probabilities in `probability_model` jsonb, coverage in `policy` jsonb, and `covers` in evidence `facts`.                                                                                                                  | Every new field rides on an existing jsonb column.                                                                                                                                                                                                        |

**Test seams (agreed with the user):**

1. `runAnalysis(request, { store, collect, model })`: every policy outcome and every coverage rule, end to end.
2. `fitArtifact(games, cutoff)` plus `scoreHoldout` / `summarize`: the uncertainty the artifact records and the threshold evaluation. `fitUncertainty` and `conservativeProbabilities` are pure data functions under this seam and are tested directly where the fit would make the case hard to construct.

Existing `decidePolicy` unit tests (`src/lib/server/analysis/policy.test.ts`) are updated to the new input shape, not extended. New behavior is asserted through seam 1.

**Out of scope:** beating the market (open-ended model research); sending conservative values to the thesis drafter; personalized stakes; a historical return study (needs timestamped executable prices).

**Commands used throughout** (run from the repo root):

- Unit tests: `npx vp test <path>`. Expect `Tests N passed`.
- Integration: `npm run -s test:integration` (needs `DATABASE_URL` in `.env`; uses throwaway schemas).
- E2E: `npx playwright test`.
- Lint and format: `npx vp check --fix && npx vp check`.
- Svelte types: `npx svelte-check --threshold error`. Expect `0 ERRORS`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## Phase A — Uncertainty recorded by the artifact (seam 2)

### Task 1: Slate key, clustered interval, calibration table, conservative probabilities

**Files:**

- Create: `src/lib/server/models/uncertainty.ts`
- Test: `tests/model/uncertainty.test.ts`

**Step 1: Write the failing test**

```ts
// tests/model/uncertainty.test.ts
import { describe, expect, it } from "vite-plus/test";
import {
  conservativeProbabilities,
  fitUncertainty,
  slateOf,
  UNCERTAINTY_OPTIONS,
  type CalibrationSample,
} from "../../src/lib/server/models/uncertainty.ts";

function samples(
  count: number,
  slateSize: number,
  winsFor: (index: number) => boolean,
  decisiveWin = 0.62,
): CalibrationSample[] {
  return Array.from({ length: count }, (_, index) => ({
    market: "moneyline" as const,
    slate: `s${Math.floor(index / slateSize)}`,
    decisiveWin,
    outcome: winsFor(index) ? ("win" as const) : ("loss" as const),
  }));
}

describe("slates", () => {
  it("groups Thursday to Monday night, in Eastern time, into one week", () => {
    const thursday = slateOf("2026-10-23T00:15:00.000Z"); // Thu 8:15 pm ET
    expect(slateOf("2026-10-26T17:00:00.000Z")).toBe(thursday); // Sun 1 pm ET
    expect(slateOf("2026-10-28T00:15:00.000Z")).toBe(thursday); // Mon 8:15 pm ET
    expect(slateOf("2026-10-30T00:15:00.000Z")).not.toBe(thursday); // next Thu
  });
});

describe("calibration table", () => {
  it("bins decisive forecasts and keeps the conservative rate at or below the observed rate", () => {
    const table = fitUncertainty(samples(400, 4, (index) => index % 5 < 3));
    const bin = table.markets.moneyline.find((entry) => entry.lower === 0.6)!;
    expect(bin.sides).toBe(400);
    expect(bin.slates).toBe(100);
    expect(bin.observedRate).toBeCloseTo(0.6, 10);
    expect(bin.meanPredicted).toBeCloseTo(0.62, 10);
    expect(bin.conservativeRate!).toBeLessThan(bin.observedRate!);
    expect(table.options).toEqual(UNCERTAINTY_OPTIONS);
  });

  it("treats a slate's results as one unit, so correlated slates widen the interval", () => {
    // Same 400 sides and the same 50% rate; only the slate grouping differs.
    const independent = fitUncertainty(samples(400, 1, (index) => index % 2 === 0));
    const correlated = fitUncertainty(
      samples(400, 10, (index) => Math.floor(index / 10) % 2 === 0),
    );
    const rate = (table: ReturnType<typeof fitUncertainty>) =>
      table.markets.moneyline.find((entry) => entry.lower === 0.6)!.conservativeRate!;
    expect(rate(correlated)).toBeLessThan(rate(independent) - 0.03);
  });

  it("ignores pushes, which have no decisive result", () => {
    const pushes = samples(100, 1, () => true).map((sample) => ({
      ...sample,
      outcome: "push" as const,
    }));
    expect(fitUncertainty(pushes).markets.moneyline.every((bin) => bin.sides === 0)).toBe(true);
  });

  it("is reproducible from its stored seed", () => {
    const input = samples(300, 3, (index) => index % 3 !== 0);
    expect(fitUncertainty(input)).toEqual(fitUncertainty(input));
  });
});

describe("conservative probabilities", () => {
  const table = fitUncertainty(samples(400, 4, (index) => index % 5 < 3));

  it("lowers the decisive win probability by the bin's calibration bound and keeps the push", () => {
    const result = conservativeProbabilities(table, "moneyline", {
      win: 0.6,
      loss: 0.37,
      push: 0.03,
    });
    if (!result.available) throw new Error(result.reason);
    const bin = table.markets.moneyline.find((entry) => entry.lower === 0.6)!;
    const q = 0.6 / 0.97;
    const expected = Math.min(q, bin.conservativeRate! + (q - bin.meanPredicted!));
    expect(result.probabilities.win).toBeCloseTo(expected * 0.97, 12);
    expect(result.probabilities.push).toBe(0.03);
    const { win, loss, push } = result.probabilities;
    expect(win + loss + push).toBeCloseTo(1, 12);
    expect(result.probabilities.win).toBeLessThanOrEqual(0.6);
    expect(result.confidence).toBe(UNCERTAINTY_OPTIONS.confidence);
  });

  it("is unavailable where training produced too few forecasts", () => {
    const result = conservativeProbabilities(table, "moneyline", { win: 0.2, loss: 0.8, push: 0 });
    expect(result).toMatchObject({ available: false });
    expect(!result.available && result.reason).toMatch(/fewer than 60/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vp test tests/model/uncertainty.test.ts`
Expected: FAIL with `Cannot find module '../../src/lib/server/models/uncertainty.ts'`

**Step 3: Write minimal implementation**

```ts
// src/lib/server/models/uncertainty.ts
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
  method: "walk-forward-calibration";
  options: typeof UNCERTAINTY_OPTIONS;
  markets: Record<Market, CalibrationBin[]>;
};

export type UncertaintyAssessment =
  | { available: true; confidence: number; probabilities: OutcomeProbabilities }
  | { available: false; reason: string };

const MARKETS: readonly Market[] = ["moneyline", "spread", "total"];
const SIX_HOURS_MS = 6 * 3_600_000;

/**
 * The NFL week a kickoff belongs to: the Tuesday that starts it. Kickoffs are shifted six hours
 * back first, so a Monday night game (early Tuesday in UTC) stays in its week.
 */
export function slateOf(kickoff: string): string {
  const shifted = new Date(Date.parse(kickoff) - SIX_HOURS_MS);
  const daysSinceTuesday = (shifted.getUTCDay() + 5) % 7;
  const tuesday = new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() - daysSinceTuesday,
    ),
  );
  return tuesday.toISOString().slice(0, 10);
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
```

**Step 4: Run test to verify it passes**

Run: `npx vp test tests/model/uncertainty.test.ts`
Expected: PASS (8 tests). If the "correlated slates" margin of 0.03 fails, print both rates. With 40 slates against 400 the gap should be about 0.08. Do not loosen the assertion below a clear gap.

**Step 5: Commit**

```bash
git add src/lib/server/models/uncertainty.ts tests/model/uncertainty.test.ts
git commit -m "feat: add slate-clustered calibration uncertainty for model probabilities"
```

---

### Task 2: The artifact records walk-forward calibration (version 4)

**Files:**

- Modify: `src/lib/server/models/fit.ts` (`walkForwardResiduals`, around lines 120–146)
- Modify: `src/lib/server/models/evaluate.ts` (export `settleMargin`, `settleTotal`)
- Modify: `src/lib/server/models/train.ts` (`fitArtifact`)
- Modify: `src/lib/server/models/artifact.ts` (`version: 4`, `uncertainty` field)
- Modify: `src/lib/server/analysis/model.ts` (`SUPPORTED_VERSION = 4`)
- Modify: `src/lib/server/analysis/model.test.ts` (expected `version: 3` → `4` for the real fitted artifact)
- Test: `tests/model/uncertainty.test.ts` (append)

**Step 1: Write the failing test** (append to `tests/model/uncertainty.test.ts`)

```ts
import type { PricedGame } from "../../src/lib/server/models/games.ts";
import { fitArtifact } from "../../src/lib/server/models/train.ts";

/** A league with real team strength, a priced spread on every game, and three games a slate. */
function pricedLeague(count: number): PricedGame[] {
  let seed = 5;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const strength = Array.from({ length: 12 }, (_, team) => team - 5.5);
  return Array.from({ length: count }, (_, index) => {
    const home = index % 12;
    const away = (home + 1 + (index % 11)) % 12;
    const margin = Math.round(2 + strength[home]! - strength[away]! + (next() - 0.5) * 28);
    const awayScore = 10 + Math.floor(next() * 14);
    return {
      id: `p${String(index).padStart(4, "0")}`,
      kickoff: new Date(
        Date.UTC(2015, 8, 10) + Math.floor(index / 3) * 7 * 86_400_000,
      ).toISOString(),
      home: `T${home}`,
      away: `T${away}`,
      homeScore: Math.max(0, awayScore + margin),
      awayScore,
      prices: {
        moneyline: { home: { american: -150 }, away: { american: 130 } },
        spread: { line: -3, home: { american: -110 }, away: { american: -110 } },
        total: { line: 44.5, over: { american: -110 }, under: { american: -110 } },
      },
    };
  });
}

describe("artifact uncertainty", () => {
  const games = pricedLeague(1500);
  const cutoff = games[1199]!.kickoff;

  it("records a walk-forward calibration table for every market", () => {
    const artifact = fitArtifact(games, cutoff);
    expect(artifact.version).toBe(4);
    expect(artifact.uncertainty.method).toBe("walk-forward-calibration");
    for (const market of ["moneyline", "spread", "total"] as const) {
      const populated = artifact.uncertainty.markets[market].filter((bin) => bin.sides > 0);
      expect(populated.length, market).toBeGreaterThan(0);
      for (const bin of populated.filter((entry) => entry.conservativeRate !== null)) {
        expect(bin.conservativeRate!).toBeLessThanOrEqual(bin.observedRate! + 1e-12);
      }
    }
  });

  it("never looks at results after the training cutoff", () => {
    const flipped = games.map((game, index) =>
      index > 1199 ? { ...game, homeScore: game.awayScore, awayScore: game.homeScore } : game,
    );
    expect(fitArtifact(flipped, cutoff).uncertainty).toEqual(
      fitArtifact(games, cutoff).uncertainty,
    );
  });

  it("is reproducible", () => {
    expect(fitArtifact(games, cutoff).uncertainty).toEqual(fitArtifact(games, cutoff).uncertainty);
  });

  it("has no calibration when the window is too small for walk-forward forecasts", () => {
    const tiny = fitArtifact(games.slice(0, 20), games[19]!.kickoff);
    expect(tiny.uncertainty.markets.moneyline.every((bin) => bin.sides === 0)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vp test tests/model/uncertainty.test.ts`
Expected: FAIL with `expected 3 to be 4` (and `Cannot read properties of undefined (reading 'method')`).

**Step 3: Write minimal implementation**

3a. In `src/lib/server/models/fit.ts`, replace `walkForwardResiduals` with a predictions function and keep the old name as a thin wrapper:

```ts
export type WalkForwardPrediction = {
  /** Row index in the training rows. */
  index: number;
  /** Block number, from 1. Block 0 only trains. */
  block: number;
  mean: number;
  residual: number;
};

/**
 * Out-of-sample predictions. Rows are split into chronological blocks. Each block after the
 * first is predicted by a model fit on every block before it. Rows must be in kickoff order.
 */
export function walkForwardPredictions(
  rows: readonly FeatureRow[],
  targets: readonly number[],
  ridge: number,
  folds: number,
): WalkForwardPrediction[] {
  if (folds < 2) throw new Error("Walk-forward residuals need at least two blocks");
  const starts = Array.from({ length: folds + 1 }, (_, index) =>
    Math.floor((index * rows.length) / folds),
  );
  const predictions: WalkForwardPrediction[] = [];
  for (let block = 1; block < folds; block += 1) {
    const from = starts[block] ?? 0;
    const to = starts[block + 1] ?? rows.length;
    const model = fitRidge(rows.slice(0, from), targets.slice(0, from), ridge);
    for (let index = from; index < to; index += 1) {
      const row = rows[index];
      if (!row) continue;
      const mean = predictMean(model, row);
      predictions.push({ index, block, mean, residual: (targets[index] ?? 0) - mean });
    }
  }
  return predictions;
}

/** Residuals that the model did not see when it was fit. See walkForwardPredictions. */
export function walkForwardResiduals(
  rows: readonly FeatureRow[],
  targets: readonly number[],
  ridge: number,
  folds: number,
): number[] {
  return walkForwardPredictions(rows, targets, ridge, folds).map(
    (prediction) => prediction.residual,
  );
}
```

3b. In `src/lib/server/models/evaluate.ts`, add `export` to `function settleMargin` and `function settleTotal`.

3c. In `src/lib/server/models/artifact.ts`: import `type ArtifactUncertainty` from `./uncertainty.ts`, change `version: 3;` to `version: 4;`, and add after `baseRates`:

```ts
/** Walk-forward calibration per market, for the conservative probabilities the value policy needs. */
uncertainty: ArtifactUncertainty;
```

3d. In `src/lib/server/models/train.ts`, compute calibration samples from block 2 onward. Each block uses residual distributions built only from earlier blocks' walk-forward residuals, and key weights from earlier training margins:

```ts
// new imports
import {
  fitResidualDistribution,
  integerMass,
  keyNumberWeights,
  moneylineFromMargin,
  spreadFromMargin,
  totalFromDistribution,
  type ResidualDistribution,
  type SideProbability,
} from "./distribution.ts";
import { settleMargin, settleTotal } from "./evaluate.ts";
import {
  DEFAULT_FIT,
  fitRidge,
  predictMean,
  walkForwardPredictions,
  type WalkForwardPrediction,
} from "./fit.ts";
import { fitUncertainty, slateOf, type CalibrationSample } from "./uncertainty.ts";
import type { FeatureRow } from "./features.ts";

function decisive(side: SideProbability): number {
  const total = side.win + side.loss;
  return total > 0 ? side.win / total : 0.5;
}

/**
 * Walk-forward forecasts for calibration. Block 1 has no earlier out-of-sample residuals, so
 * calibration starts at block 2. Every input to a block's forecast predates that block.
 */
function calibrationSamples(
  train: readonly FeatureRow[],
  byId: ReadonlyMap<string, PricedGame>,
  margins: readonly WalkForwardPrediction[],
  totals: readonly WalkForwardPrediction[],
  marginTargets: readonly number[],
): CalibrationSample[] {
  const samples: CalibrationSample[] = [];
  const distributions = new Map<
    number,
    { margin: ResidualDistribution; total: ResidualDistribution }
  >();
  margins.forEach((marginPrediction, position) => {
    const totalPrediction = totals[position]!;
    if (marginPrediction.block < 2) return;
    let pair = distributions.get(marginPrediction.block);
    if (!pair) {
      const earlier = (list: readonly WalkForwardPrediction[]) =>
        list.filter((entry) => entry.block < marginPrediction.block).map((entry) => entry.residual);
      const blockStart = marginPrediction.index;
      pair = {
        margin: fitResidualDistribution(
          earlier(margins),
          DEFAULT_FIT.residualBandwidth,
          undefined,
          keyNumberWeights(marginTargets.slice(0, blockStart)),
        ),
        total: fitResidualDistribution(earlier(totals), DEFAULT_FIT.residualBandwidth),
      };
      distributions.set(marginPrediction.block, pair);
    }
    const row = train[marginPrediction.index]!;
    const game = byId.get(row.gameId)!;
    const slate = slateOf(game.kickoff);
    const marginBins = integerMass(pair.margin, marginPrediction.mean);
    const margin = game.homeScore - game.awayScore;
    const moneyline = moneylineFromMargin(marginBins);
    samples.push(
      {
        market: "moneyline",
        slate,
        decisiveWin: decisive(moneyline.home),
        outcome: settleMargin(margin),
      },
      {
        market: "moneyline",
        slate,
        decisiveWin: decisive(moneyline.away),
        outcome: settleMargin(-margin),
      },
    );
    const spreadPrice = game.prices?.spread;
    if (spreadPrice) {
      const spread = spreadFromMargin(marginBins, spreadPrice.line);
      samples.push(
        {
          market: "spread",
          slate,
          decisiveWin: decisive(spread.home),
          outcome: settleMargin(margin, spreadPrice.line),
        },
        {
          market: "spread",
          slate,
          decisiveWin: decisive(spread.away),
          outcome: settleMargin(-margin, -spreadPrice.line),
        },
      );
    }
    const totalPrice = game.prices?.total;
    if (totalPrice) {
      const total = totalFromDistribution(
        integerMass(pair.total, totalPrediction.mean),
        totalPrice.line,
      );
      const points = game.homeScore + game.awayScore;
      const over = settleTotal(points, totalPrice.line);
      samples.push(
        { market: "total", slate, decisiveWin: decisive(total.over), outcome: over },
        {
          market: "total",
          slate,
          decisiveWin: decisive(total.under),
          outcome: over === "win" ? "loss" : over === "loss" ? "win" : "push",
        },
      );
    }
  });
  return samples;
}
```

In `fitArtifact`, replace the `residuals` helper:

```ts
const walkForward = train.length >= MIN_WALK_FORWARD_GAMES;
const marginPredictions = walkForward
  ? walkForwardPredictions(train, marginTargets, DEFAULT_FIT.ridge, DEFAULT_FIT.residualFolds)
  : [];
const totalPredictions = walkForward
  ? walkForwardPredictions(train, totalTargets, DEFAULT_FIT.ridge, DEFAULT_FIT.residualFolds)
  : [];
const inSample = (targets: number[], model: typeof marginModel) =>
  train.map((row, index) => (targets[index] ?? 0) - predictMean(model, row));
const marginResiduals = walkForward
  ? marginPredictions.map((entry) => entry.residual)
  : inSample(marginTargets, marginModel);
const totalResiduals = walkForward
  ? totalPredictions.map((entry) => entry.residual)
  : inSample(totalTargets, totalModel);
const uncertainty = fitUncertainty(
  calibrationSamples(train, byId, marginPredictions, totalPredictions, marginTargets),
);
```

Set `version: 4` and add `uncertainty,` after `baseRates` in the `withChecksum({...})` object.

`settleMargin(-margin, -line)` works for the away side: away covers when `-margin + (-line) > 0`.

3e. In `src/lib/server/analysis/model.ts`, set `const SUPPORTED_VERSION = 4;`. In `src/lib/server/analysis/model.test.ts`, the "records the offer's probabilities" expectation changes `version: 3` to `version: 4`.

**Step 4: Run tests to verify they pass**

Run: `npx vp test tests/model src/lib/server/analysis/model.test.ts`
Expected: PASS, all model tests included (existing `residuals.test.ts` still exercises `walkForwardResiduals`).

**Step 5: Commit**

```bash
git add src/lib/server/models tests/model src/lib/server/analysis/model.ts src/lib/server/analysis/model.test.ts
git commit -m "feat: record walk-forward calibration uncertainty in the model artifact"
```

---

### Task 3: Evaluation reports the threshold's behavior and slate-clustered intervals

**Files:**

- Create: `src/lib/domain/threshold.ts`
- Modify: `src/lib/server/models/evaluate.ts` (`ScoredForecast`, `scoreHoldout`, `BaselineComparison`, `EvaluationSummary`, `summarize`)
- Modify: `scripts/model/evaluate.ts` (print the threshold report)
- Modify: `tests/model/release.test.ts` (its hand-built `EvaluationSummary` and `BaselineComparison` gain the new fields)
- Test: `tests/model/uncertainty.test.ts` (append)

**Step 1: Write the failing test** (append)

```ts
import { VALUE_THRESHOLD } from "../../src/lib/domain/threshold.ts";
import { scoreHoldout, summarize } from "../../src/lib/server/models/evaluate.ts";
import { buildFeatureRows } from "../../src/lib/server/models/features.ts";

describe("threshold evaluation", () => {
  const games = pricedLeague(1500);
  const artifact = fitArtifact(games, games[1199]!.kickoff);
  const holdout = buildFeatureRows(games, artifact.featureParameters).filter(
    (row) => row.kickoff > artifact.trainingCutoff,
  );
  const summary = summarize(scoreHoldout(artifact, holdout, games));

  it("reports how the frozen threshold would have behaved, without choosing it", () => {
    expect(summary.threshold.version).toBe(VALUE_THRESHOLD.version);
    expect(summary.threshold.conservativeExpectedValue).toBe(
      VALUE_THRESHOLD.conservativeExpectedValue,
    );
    expect(summary.threshold.note).toMatch(/closing prices/i);
    for (const market of ["moneyline", "spread", "total"] as const) {
      const report = summary.threshold.markets[market];
      expect(report.candidates).toBeLessThanOrEqual(report.assessed);
      expect(report.wins).toBeLessThanOrEqual(report.decisive);
    }
  });

  it("gives each baseline comparison a slate-clustered interval for the log-loss difference", () => {
    for (const comparison of summary.baselines) {
      const difference = comparison.model.logLoss - comparison.baseline.logLoss;
      const interval = comparison.logLossDifferenceInterval;
      expect(interval, `${comparison.market} ${comparison.name}`).not.toBeNull();
      expect(interval![0]).toBeLessThanOrEqual(difference + 1e-9);
      expect(interval![1]).toBeGreaterThanOrEqual(difference - 1e-9);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vp test tests/model/uncertainty.test.ts`
Expected: FAIL with `Cannot find module '../../src/lib/domain/threshold.ts'`

**Step 3: Write minimal implementation**

3a. Create `src/lib/domain/threshold.ts`:

```ts
/**
 * The value threshold applied to the conservative expected value. Frozen in code before any
 * holdout outcome was examined; evaluation reports how it would have behaved and never tunes it.
 * Changing it requires a new version, which changes the policy version.
 */
export const VALUE_THRESHOLD = {
  version: "threshold-2026-10-25",
  conservativeExpectedValue: 0,
} as const;
```

3b. In `src/lib/server/models/evaluate.ts`:

- Imports: `americanToDecimal, expectedValue` from `../../domain/odds.ts`; `VALUE_THRESHOLD` from `../../domain/threshold.ts`; `clusteredInterval, conservativeProbabilities, slateOf, UNCERTAINTY_OPTIONS` from `./uncertainty.ts`.
- `ScoredForecast` gains:

```ts
slate: string;
/** This side's closing price, when recorded. */
americanOdds: number | null;
/** Expected value per unit at the closing price from conservative probabilities. Null when unavailable. */
conservativeExpectedValue: number | null;
```

- In `scoreHoldout`, compute these for each pushed forecast with a helper:

```ts
function conservativeValue(
  artifact: ModelArtifact,
  market: Market,
  probability: SideProbability,
  american: number | null,
): number | null {
  if (american === null) return null;
  const assessed = conservativeProbabilities(artifact.uncertainty, market, probability);
  if (!assessed.available) return null;
  return expectedValue({
    decimalOdds: americanToDecimal(american),
    probabilities: assessed.probabilities,
    illustrative: true,
  }).perUnit;
}
```

Use `slate: slateOf(game.kickoff)` everywhere. The moneyline uses `prices?.moneyline?.home.american ?? null`, the spread `prices.spread.home.american`, and the total `prices.total.over.american`. `missing()` takes `slate` and returns `americanOdds: null, conservativeExpectedValue: null`.

- `BaselineComparison` gains `logLossDifferenceInterval: [number, number] | null`. For each comparison, group its members by slate and compute:

```ts
function differenceInterval(
  members: readonly ScoredForecast[],
  baseline: (forecast: ScoredForecast) => SideProbability,
): [number, number] | null {
  const bySlate = new Map<string, number[]>();
  for (const forecast of members) {
    const difference =
      multiclassLogLoss(forecast.probability, forecast.outcome) -
      multiclassLogLoss(baseline(forecast), forecast.outcome);
    bySlate.set(forecast.slate, [...(bySlate.get(forecast.slate) ?? []), difference]);
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
```

- `EvaluationSummary` gains:

```ts
threshold: {
  version: string;
  conservativeExpectedValue: number;
  note: string;
  markets: Record<
    Market,
    {
      assessed: number;
      candidates: number;
      decisive: number;
      wins: number;
      observedRate: number | null;
      meanBreakEven: number | null;
      interval: [number, number] | null;
    }
  >;
}
```

- In `summarize`, for each market: `assessed` = forecasts with `conservativeExpectedValue !== null`; `candidates` = those with `conservativeExpectedValue > VALUE_THRESHOLD.conservativeExpectedValue`. Over the candidates' decisive outcomes, count `decisive` and `wins`. `observedRate = wins / decisive`. `meanBreakEven` = the mean of `1 / americanToDecimal(americanOdds)`. `interval` = `clusteredInterval` over the candidates grouped by slate, with the decisive win rate as the statistic. Set `note` to: `"Descriptive only. Closing prices stand in for the offer here, and the spec forbids treating closing prices as executable; the threshold was frozen before this report and is not tuned on it."`

3c. In `tests/model/release.test.ts`, the helper `comparison(...)` adds `logLossDifferenceInterval: null`. The helper `summary(...)` adds:

```ts
    threshold: {
      version: "threshold-2026-10-25",
      conservativeExpectedValue: 0,
      note: "",
      markets: {
        moneyline: { assessed: 0, candidates: 0, decisive: 0, wins: 0, observedRate: null, meanBreakEven: null, interval: null },
        spread: { assessed: 0, candidates: 0, decisive: 0, wins: 0, observedRate: null, meanBreakEven: null, interval: null },
        total: { assessed: 0, candidates: 0, decisive: 0, wins: 0, observedRate: null, meanBreakEven: null, interval: null },
      },
    },
```

The model-source test in `src/lib/server/analysis/model.test.ts` that builds a `summary` inline needs the same `threshold` block.

3d. In `scripts/model/evaluate.ts`, add `threshold: summary.threshold` to the printed JSON next to `release`.

**Step 4: Run tests to verify they pass**

Run: `npx vp test tests/model src/lib/server/analysis/model.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/domain/threshold.ts src/lib/server/models/evaluate.ts scripts/model/evaluate.ts tests/model src/lib/server/analysis/model.test.ts
git commit -m "feat: report the frozen value threshold and slate-clustered intervals in evaluation"
```

---

## Phase B — The value policy uses the uncertainty (seam 1)

### Task 4: The model source records conservative probabilities

**Files:**

- Modify: `src/lib/server/analysis/model.ts` (`RunModel`, `createArtifactModel`, `DisplayedModel`, `forDisplay`)
- Modify: `src/lib/server/analysis/run.test.ts` (fake `computed` source, about line 223)
- Modify: `tests/store-contract.ts` (fake `unreleasedModel`)
- Test: `src/lib/server/analysis/model.test.ts`

**Step 1: Write the failing test** (in `model.test.ts`)

Add to "records the offer's probabilities and why an unreleased market is not eligible". The file's 60-game fixture has fewer than 40 training games before its cutoff, so it has no walk-forward calibration, and the honest result is "unavailable":

```ts
expect(result.uncertainty).toMatchObject({ available: false });
expect(!result.uncertainty.available && result.uncertainty.reason).toMatch(/fewer than 60/);
```

`tests/model/uncertainty.test.ts` (Tasks 1–2) already covers the populated case. Do not enlarge this fixture.

In "what the report page receives", extend `recorded` with:

```ts
    uncertainty: {
      available: true as const,
      confidence: 0.9,
      probabilities: { win: 0.39, loss: 0.527, push: 0.083 },
    },
```

and assert `forDisplay(recorded)` equals `{ ...recorded, probabilities: null, uncertainty: { available: false, reason: "Not shown: the market is not eligible." } }`, and that `JSON.stringify(shown)` contains neither `"0.406"` nor `"0.39"`.

**Step 2: Run test to verify it fails**

Run: `npx vp test src/lib/server/analysis/model.test.ts`
Expected: FAIL (`uncertainty` undefined).

**Step 3: Write minimal implementation**

In `model.ts`, the computed variant of `RunModel` gains `uncertainty: UncertaintyAssessment;` (import from `../models/uncertainty.ts`). In `createArtifactModel`, after `probabilities`:

```ts
const uncertainty = conservativeProbabilities(artifact.uncertainty, offer.market, probabilities);
```

and include `uncertainty` in the returned object. `DisplayedModel`'s computed variant keeps `uncertainty: UncertaintyAssessment`. `forDisplay` for an ineligible model returns:

```ts
return {
  ...model,
  probabilities: null,
  uncertainty: { available: false, reason: "Not shown: the market is not eligible." },
};
```

Update the two fake sources (`run.test.ts` `computed(...)`, `store-contract.ts` `unreleasedModel`) to include `uncertainty: { available: false, reason: "test" }` for now. Task 5 replaces the run-test one.

**Step 4: Run tests to verify they pass**

Run: `npx vp test src/lib/server/analysis`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/server/analysis tests/store-contract.ts
git commit -m "feat: record conservative probabilities with each run's model output"
```

---

### Task 5: Policy r2: conservative expected value against the frozen threshold

**Files:**

- Modify: `src/lib/server/analysis/policy.ts`
- Modify: `src/lib/server/analysis/policy.test.ts` (new input shape and version)
- Modify: `src/lib/server/analysis/run.ts` (pass uncertainty)
- Test: `src/lib/server/analysis/run.test.ts` (new describe block)

**Step 1: Write the failing test** (append to `run.test.ts`, and replace the earlier `computed` helper's uncertainty with a parameter)

```ts
describe("value policy with uncertainty", () => {
  const quiet: EvidenceCollector = async () => ({ items: [], gaps: [], materialGaps: [] });
  const point = { win: 0.6, loss: 0.38, push: 0.02 };
  const released =
    (uncertainty: UncertaintyAssessment): ModelSource =>
    async () => ({
      status: "computed",
      artifact: {
        checksum: "b".repeat(64),
        version: 4,
        trainingCutoff: "2026-03-01T00:00:00Z",
        releaseStatus: "released-experimental",
        releasedMarkets: ["moneyline"],
      },
      probabilities: point,
      uncertainty,
      eligible: true,
      reason: "Released for moneyline.",
    });
  const sure = (win: number, loss: number): UncertaintyAssessment => ({
    available: true,
    confidence: 0.9,
    probabilities: { win, loss, push: 0.02 },
  });
  const run = (model: ModelSource, americanOdds = 110) =>
    runAnalysis(request({ americanOdds }), { store: createMemoryStore(), collect: quiet, model });

  it("calls a market a candidate only when the conservative estimate clears the threshold", async () => {
    const outcome = await run(released(sure(0.5, 0.48)));
    const policy = outcome.run!.policy!;
    expect(policy.policyVersion).toBe("policy-2026-10-25.2");
    expect(policy.conclusion).toBe("experimental value candidate");
    expect(policy.expectedValuePerUnit).toBeCloseTo(0.6 * 1.1 - 0.38, 10);
    expect(policy.conservativeExpectedValuePerUnit).toBeCloseTo(0.5 * 1.1 - 0.48, 10);
    expect(policy.threshold).toEqual({
      version: "threshold-2026-10-25",
      conservativeExpectedValue: 0,
    });
    expect(policy.priceCutoff).toMatchObject({ available: true, decimalMinimum: 1 + 0.48 / 0.5 });
  });

  it("leans, not recommends, when only the point estimate is positive", async () => {
    const policy = (await run(released(sure(0.45, 0.53)))).run!.policy!;
    expect(policy.conclusion).toBe("experimental lean");
    expect(policy.blockingReason).toMatch(/conservative estimate at 90% confidence is -0\.0350/);
  });

  it("reports insufficient evidence when uncertainty cannot be assessed", async () => {
    const policy = (
      await run(released({ available: false, reason: "Training produced 12 forecasts." }))
    ).run!.policy!;
    expect(policy.conclusion).toBe("insufficient evidence");
    expect(policy.blockingReason).toBe(
      "Uncertainty assessment unavailable: Training produced 12 forecasts.",
    );
    expect(policy.conservativeExpectedValuePerUnit).toBeNull();
  });

  it("passes when the price leaves no positive expected value", async () => {
    const policy = (await run(released(sure(0.5, 0.48)), -200)).run!.policy!;
    expect(policy.conclusion).toBe("pass");
    expect(policy.expectedValuePerUnit).toBeCloseTo(0.6 * 0.5 - 0.38, 10);
  });

  it("does not assess uncertainty for an ineligible model", async () => {
    const ineligible: ModelSource = async (...args) =>
      ({
        ...(await released(sure(0.5, 0.48))(...args)),
        eligible: false,
        reason: "Unreleased artifacts are not eligible.",
      }) as Awaited<ReturnType<ModelSource>>;
    const policy = (await run(ineligible)).run!.policy!;
    expect(policy.conclusion).toBe("insufficient evidence");
    expect(policy.uncertainty).toEqual({ available: false, reason: "Not assessed." });
  });
});
```

Add `import type { UncertaintyAssessment } from "#lib/server/models/uncertainty.ts";`. In the earlier "research run model" block, give the `computed(eligible)` helper `uncertainty: { available: true, confidence: 0.9, probabilities: { win: 0.55, loss: 0.43, push: 0.02 } }`, so the existing "gives a released market's probabilities to the policy" test still gets a candidate at +110 (0.55·1.1 − 0.43 = 0.175 > 0).

**Step 2: Run test to verify it fails**

Run: `npx vp test src/lib/server/analysis/run.test.ts`
Expected: FAIL (`policy-2026-10-25` ≠ `policy-2026-10-25.2`, `conservativeExpectedValuePerUnit` undefined).

**Step 3: Write minimal implementation**

3a. `policy.ts`:

```ts
import { VALUE_THRESHOLD } from "#lib/domain/threshold.ts";
import type { UncertaintyAssessment } from "../models/uncertainty.ts";

export const POLICY_VERSION = "policy-2026-10-25.2";

export type PolicyInput = {
  offerValid: boolean;
  gameStarted: boolean;
  materialEvidenceMissing: boolean;
  releaseStatus: ReleaseStatus;
  releaseReason?: string;
  probabilities: OutcomeProbabilities | null;
  /** Conservative probabilities from the artifact's calibration. Assessed only for an eligible model. */
  uncertainty: UncertaintyAssessment;
  decimalOdds: number;
};

export type PolicyDecision = {
  policyVersion: typeof POLICY_VERSION;
  conclusion: PolicyConclusion;
  experimental: true;
  blockingReason: string | null;
  expectedValuePerUnit: number | null;
  conservativeExpectedValuePerUnit: number | null;
  threshold: typeof VALUE_THRESHOLD;
  uncertainty: UncertaintyAssessment;
  priceCutoff:
    | { available: false; reason: string }
    | { available: true; decimalMinimum: number; conservativeExpectedValue: number };
  label: /* unchanged */;
};
```

- Delete `targetExpectedValue` and the old `priceCutoff` helper. The new cutoff:

```ts
function priceCutoff(uncertainty: UncertaintyAssessment): PolicyDecision["priceCutoff"] {
  if (!uncertainty.available) {
    return { available: false, reason: `Price cutoff is unavailable: ${uncertainty.reason}` };
  }
  const { win, loss } = uncertainty.probabilities;
  if (!(win > 0)) {
    return {
      available: false,
      reason: "Price cutoff is unavailable because the conservative win probability is zero.",
    };
  }
  const target = VALUE_THRESHOLD.conservativeExpectedValue;
  return {
    available: true,
    decimalMinimum: 1 + (loss + target) / win,
    conservativeExpectedValue: target,
  };
}
```

- `base` adds `threshold: VALUE_THRESHOLD`, `conservativeExpectedValuePerUnit: null`, `uncertainty: input.uncertainty`, and `priceCutoff: priceCutoff(input.uncertainty)`. Early blocking branches (invalid offer, started, material evidence, unreleased, non-finite probabilities) keep their current reasons and EV `null`.
- Replace the tail after `value.perUnit === null` with the ladder (D5):

```ts
if (value.perUnit <= 0) {
  return {
    ...base,
    conclusion: "pass",
    blockingReason:
      "The released artifact does not show positive expected value at the recorded price.",
    expectedValuePerUnit: value.perUnit,
  };
}
if (!input.uncertainty.available) {
  return {
    ...base,
    conclusion: "insufficient evidence",
    blockingReason: `Uncertainty assessment unavailable: ${input.uncertainty.reason}`,
    expectedValuePerUnit: value.perUnit,
  };
}
const conservative = expectedValue({
  decimalOdds: input.decimalOdds,
  probabilities: input.uncertainty.probabilities,
  illustrative: false,
}).perUnit!;
const confidence = `${Math.round(input.uncertainty.confidence * 100)}%`;
if (conservative <= VALUE_THRESHOLD.conservativeExpectedValue) {
  return {
    ...base,
    conclusion: "experimental lean",
    blockingReason: `Positive point estimate, but the conservative estimate at ${confidence} confidence is ${conservative.toFixed(4)} units, not above the ${VALUE_THRESHOLD.conservativeExpectedValue} threshold (${VALUE_THRESHOLD.version}).`,
    expectedValuePerUnit: value.perUnit,
    conservativeExpectedValuePerUnit: conservative,
  };
}
return {
  ...base,
  conclusion: "experimental value candidate",
  blockingReason: null,
  expectedValuePerUnit: value.perUnit,
  conservativeExpectedValuePerUnit: conservative,
};
```

3b. `run.ts`: pass

```ts
    uncertainty:
      eligible && probabilityModel.status === "computed"
        ? probabilityModel.uncertainty
        : { available: false, reason: "Not assessed." },
```

3c. `policy.test.ts`: replace `targetExpectedValue: 0` in `released` with `uncertainty: { available: true as const, confidence: 0.9, probabilities: { win: 0.55, loss: 0.45, push: 0 } }`. Assert the new version string. In the last test, expect `priceCutoff.decimalMinimum` to be `1 + 0.45 / 0.55` (from the conservative probabilities, equal here). Add one case: `probabilities: { win: 0.5, loss: 0.5, push: 0 }` at `decimalOdds: 1.909090909` → `"pass"`.

**Step 4: Run tests to verify they pass**

Run: `npx vp test src/lib/server/analysis && npx vp test`
Expected: PASS. If the drafter-agreement test fails, `src/lib/server/analysis/fixture-drafter.ts` needs to restate `"pass"`. It restates the policy conclusion verbatim, so no change is expected.

**Step 5: Commit**

```bash
git add src/lib/server/analysis
git commit -m "feat: require a conservative expected value above a frozen threshold for value candidates"
```

---

### Task 6: The report shows the conservative estimate, the threshold, and the uncertainty

**Files:**

- Modify: `src/routes/analysis/[id]/+page.svelte` (Conclusion section, about lines 46–61)

No automated test: in the browser suite the model is off, so the policy never reaches this branch. Verify with svelte-check and the live check in Task 10.

**Step 1: Implement**

Replace the Conclusion section's expected-value paragraph with:

```svelte
      <p>
        Expected value {run.policy.expectedValuePerUnit === null
          ? "unavailable"
          : `${run.policy.expectedValuePerUnit.toFixed(4)} units per unit staked`}
      </p>
      {#if run.policy.uncertainty.available}
        <p data-testid="conservative-ev">
          Conservative expected value at {Math.round(run.policy.uncertainty.confidence * 100)}%
          confidence: {run.policy.conservativeExpectedValuePerUnit === null
            ? "unavailable"
            : `${run.policy.conservativeExpectedValuePerUnit.toFixed(4)} units`}. Threshold
          {run.policy.threshold.conservativeExpectedValue} ({run.policy.threshold.version}).
        </p>
      {:else if run.policy.uncertainty.reason !== "Not assessed."}
        <p data-testid="conservative-ev">Uncertainty: {run.policy.uncertainty.reason}</p>
      {/if}
      {#if run.policy.priceCutoff.available}
        <p>
          The conclusion changes at decimal odds below {run.policy.priceCutoff.decimalMinimum.toFixed(3)}.
        </p>
      {/if}
```

Runs saved under `policy-2026-10-25` have no `uncertainty` or `threshold` fields. Guard with `run.policy.uncertainty?.available` and render the conservative block only when `run.policy.threshold` exists.

**Step 2: Verify**

Run: `npx svelte-check --threshold error && npx playwright test`
Expected: `0 ERRORS`, `3 passed`.

**Step 3: Commit**

```bash
git add "src/routes/analysis/[id]/+page.svelte"
git commit -m "feat: show the conservative estimate and threshold on the report"
```

---

## Phase C — Manual evidence may clear a material gap (seam 1)

### Task 7: Typed material gaps

**Files:**

- Modify: `src/lib/server/analysis/evidence.ts` (`CollectedEvidence`, `noSources`, `injuryEvidence`, `createSourceCollector`)
- Modify: `src/lib/server/analysis/evidence.test.ts` (seven `.materialGaps.join(" ")` / `toContain` uses)
- Modify: `src/lib/server/analysis/run.test.ts` (collector helpers already pass `materialGaps: []`; one test builds material gaps, update to objects)

This is a refactor with no behavior change, guarded by the existing tests.

**Step 1: Change the type**

```ts
export type MaterialGapKind = "injury-report" | "weather";

/** Evidence that should exist for this game and does not. It blocks a recommendation. */
export type MaterialGap = { kind: MaterialGapKind; text: string };

export type CollectedEvidence = {
  items: EvidenceItem[];
  gaps: string[];
  materialGaps: MaterialGap[];
};
```

- `noSources`: `materialGaps: [{ kind: "injury-report", text: "Injury report was not collected." }, { kind: "weather", text: "Weather was not collected." }]`, while `gaps` keeps the two strings.
- `injuryEvidence` returns `materialGaps: (…strings…).map((text) => ({ kind: "injury-report" as const, text }))`.
- `createSourceCollector`: weather `missing` → `{ kind: "weather", text: weather.reason }`.
- In `evidence.test.ts`, replace each `collected.materialGaps.join(" ")` with `collected.materialGaps.map((gap) => gap.text).join(" ")`, and `not.toContain("Roof is dome.")` with `.map((gap) => gap.text)` first.

**Step 2: Run tests**

Run: `npx vp test src/lib/server/analysis`
Expected: PASS (same count as before).

**Step 3: Commit**

```bash
git add src/lib/server/analysis
git commit -m "refactor: give material evidence gaps a kind"
```

---

### Task 8: The coverage rule and the policy's record of reliance

**Files:**

- Create: `src/lib/server/analysis/coverage.ts`
- Modify: `src/lib/server/sources/manual.ts` (`covers`)
- Modify: `src/lib/server/analysis/run.ts` (`ManualEvidenceInput.covers`, coverage, gaps, policy input)
- Modify: `src/lib/server/analysis/policy.ts` (`manualCoverage`, `reliesOnManualEvidence`)
- Modify: `src/lib/server/analysis/policy.test.ts` (`released` gains `manualCoverage: []`)
- Test: `src/lib/server/analysis/run.test.ts` (new describe block)

**Step 1: Write the failing test**

```ts
describe("manual evidence standing in for a missing source", () => {
  const missingBoth: EvidenceCollector = async () => ({
    items: [],
    gaps: ["Injury report was not collected.", "Weather was not collected."],
    materialGaps: [
      { kind: "injury-report", text: "Injury report was not collected." },
      { kind: "weather", text: "Weather was not collected." },
    ],
  });
  const hoursBefore = (hours: number) =>
    new Date(Date.parse(NOW) - hours * 3_600_000).toISOString();
  const entry = (covers: "injury-report" | "weather" | undefined, sourceTime: string) => ({
    text: covers === "weather" ? "Kickoff 52F, wind 8 mph, 10% rain" : "PHI: no starters out",
    url: "",
    sourceTime,
    ...(covers ? { covers } : {}),
  });
  const analyze = (
    manualEvidence: ReturnType<typeof entry>[],
    extra: Partial<AnalysisRequest> = {},
  ) =>
    runAnalysis(request({ manualEvidence, ...extra }), {
      store: createMemoryStore(),
      collect: missingBoth,
    });

  it("clears each gap that fresh, tagged manual evidence covers, and says the run relies on it", async () => {
    const outcome = await analyze([
      entry("injury-report", hoursBefore(3)),
      entry("weather", hoursBefore(2)),
    ]);
    const policy = outcome.run!.policy!;
    expect(policy.blockingReason).not.toBe("Material evidence is missing.");
    expect(policy.reliesOnManualEvidence).toBe(true);
    expect(policy.manualCoverage.map((coverage) => coverage.kind).sort()).toEqual([
      "injury-report",
      "weather",
    ]);
    expect(outcome.run!.gaps.join(" ")).toMatch(/injury report comes from manual evidence/);
  });

  it("keeps the gap when the tagged evidence is too old, and says why", async () => {
    const outcome = await analyze([
      entry("injury-report", hoursBefore(30)),
      entry("weather", hoursBefore(2)),
    ]);
    expect(outcome.run!.policy!.blockingReason).toBe("Material evidence is missing.");
    expect(outcome.run!.gaps.join(" ")).toMatch(
      /30 hours old; the injury report needs one from the last 24 hours/,
    );
  });

  it("keeps the gap for untagged evidence or evidence without a source time", async () => {
    const untagged = await analyze([
      entry(undefined, hoursBefore(1)),
      entry("weather", hoursBefore(1)),
    ]);
    expect(untagged.run!.policy!.blockingReason).toBe("Material evidence is missing.");
    const undated = await analyze([
      entry("injury-report", "unknown"),
      entry("weather", hoursBefore(1)),
    ]);
    expect(undated.run!.gaps.join(" ")).toMatch(/has no source time, so it cannot stand in/);
    expect(undated.run!.policy!.reliesOnManualEvidence).toBe(true); // weather was covered
  });

  it("re-checks carried evidence against the refresh's own cutoff", async () => {
    const parent = (
      await analyze([entry("injury-report", hoursBefore(20)), entry("weather", hoursBefore(1))])
    ).run!;
    const later = new Date(Date.parse(NOW) + 6 * 3_600_000).toISOString();
    const refreshed = await runAnalysis(
      request({
        nowIso: later,
        observedAt: later,
        parentId: parent.id,
        carriedEvidence: parent.evidence.filter((item) => item.origin === "manual"),
      }),
      { store: createMemoryStore(), collect: missingBoth },
    );
    // The injury entry is now 26 hours old; the forecast is 7 hours old.
    expect(refreshed.run!.policy!.manualCoverage.map((coverage) => coverage.kind)).toEqual([
      "weather",
    ]);
    expect(refreshed.run!.policy!.blockingReason).toBe("Material evidence is missing.");
  });
});
```

The game in `request()` kicks off after `NOW + 6h` (2026-10-26 20:15 ET), so the refresh is still pregame.

**Step 2: Run test to verify it fails**

Run: `npx vp test src/lib/server/analysis/run.test.ts`
Expected: FAIL (`reliesOnManualEvidence` undefined; the `covers` property is ignored).

**Step 3: Write minimal implementation**

3a. `src/lib/server/analysis/coverage.ts`:

```ts
import type { EvidenceItem } from "../sources/contracts.ts";
import type { MaterialGap, MaterialGapKind } from "./evidence.ts";

/** How recent tagged manual evidence must be, relative to the run's decision cutoff. */
export const MANUAL_FRESHNESS_HOURS: Record<MaterialGapKind, number> = {
  "injury-report": 24,
  weather: 12,
};

const LABELS: Record<MaterialGapKind, string> = {
  "injury-report": "injury report",
  weather: "kickoff forecast",
};

export type ManualCoverage = { kind: MaterialGapKind; evidenceId: string };

/**
 * Which material gaps fresh, tagged manual evidence clears. A tagged item clears its gap only
 * with a known source time no later than the cutoff and within that gap's freshness window.
 */
export function coverMaterialGaps(
  gaps: readonly MaterialGap[],
  manual: readonly EvidenceItem[],
  cutoffIso: string,
): { remaining: MaterialGap[]; covered: ManualCoverage[]; notes: string[] } {
  const cutoff = Date.parse(cutoffIso);
  const remaining: MaterialGap[] = [];
  const covered: ManualCoverage[] = [];
  const notes: string[] = [];
  for (const gap of gaps) {
    const label = LABELS[gap.kind];
    const limit = MANUAL_FRESHNESS_HOURS[gap.kind];
    let cover: EvidenceItem | null = null;
    for (const item of manual.filter((candidate) => candidate.facts.covers === gap.kind)) {
      if (item.publishedAt === "unknown") {
        notes.push(
          `Manual evidence ${item.id} is tagged as the ${label} but has no source time, so it cannot stand in for it.`,
        );
        continue;
      }
      const hours = (cutoff - Date.parse(item.publishedAt)) / 3_600_000;
      if (hours < 0) continue; // dated after the cutoff; already excluded from the packet
      if (hours > limit) {
        notes.push(
          `Manual evidence ${item.id} is ${Math.floor(hours)} hours old; the ${label} needs one from the last ${limit} hours.`,
        );
        continue;
      }
      cover ??= item;
    }
    if (cover) {
      covered.push({ kind: gap.kind, evidenceId: cover.id });
      notes.push(`The ${label} comes from manual evidence ${cover.id}.`);
    } else {
      remaining.push(gap);
    }
  }
  return { remaining, covered, notes };
}
```

3b. `manual.ts`: add `covers?: MaterialGapKind` to the input (import the type from `../analysis/evidence.ts`). Default facts become `{ note: text, ...(input.covers ? { covers: input.covers } : {}) }`. `evidenceItem` derives the id from content, so a tagged item gets a different id from an untagged one with the same text. That is correct.

3c. `run.ts`:

- `ManualEvidenceInput` gains `covers?: MaterialGapKind`, passed to `createManualEvidence`.
- After `collected`:

```ts
const coverage = coverMaterialGaps(
  collected.materialGaps,
  [...(request.carriedEvidence ?? []), ...manual],
  request.nowIso,
);
```

- `gaps` becomes `[...packet.gaps, ...coverage.notes, ...conflictGaps, ...late]`.
- The policy input changes to `materialEvidenceMissing: coverage.remaining.length > 0 || conflictGaps.length > 0` and adds `manualCoverage: coverage.covered`.

3d. `policy.ts`: `PolicyInput.manualCoverage: ManualCoverage[]`. `PolicyDecision` gains `manualCoverage: ManualCoverage[]` and `reliesOnManualEvidence: boolean`, both set in `base` (`reliesOnManualEvidence: input.manualCoverage.length > 0`). `policy.test.ts`'s `released` adds `manualCoverage: []`.

**Step 4: Run tests to verify they pass**

Run: `npx vp test src/lib/server && npm run -s test:integration`
Expected: PASS. Integration proves the policy JSON and evidence `facts.covers` round-trip through Neon and restore.

**Step 5: Commit**

```bash
git add src/lib/server
git commit -m "feat: let fresh, tagged manual evidence clear a material gap and record the reliance"
```

---

### Task 9: Form tag, report note, and journal label

**Files:**

- Modify: `src/lib/server/analysis/form.ts` (`ManualEvidenceRow.covers`, `parseManualEvidence`)
- Modify: `src/lib/server/analysis/form.test.ts`
- Modify: `src/routes/+page.svelte` (manual row select; `blankRow` gains `covers: ""`)
- Modify: `src/routes/analysis/[id]/+page.svelte` (reliance note)
- Modify: `src/lib/server/analysis/store.ts` (`RunSummary.reliesOnManualEvidence`, `summarize`)
- Modify: `src/lib/server/db/repository.ts` (`listCompletedSummaries` select and map)
- Modify: `src/routes/journal/+page.svelte`
- Test: `src/lib/server/analysis/form.test.ts`, `tests/store-contract.ts`, `tests/e2e/research-flow.spec.ts`

**Step 1: Write the failing tests**

`form.test.ts`:

```ts
it("reads which missing source a manual entry stands in for", () => {
  const data = new FormData();
  data.append("manualText", "Kickoff 52F, light wind");
  data.append("manualUrl", "");
  data.append("manualTime", "2026-10-25T11:00");
  data.append("manualCovers", "weather");
  const parsed = parseManualEvidence(data);
  expect(parsed.ok && parsed.entries[0]?.covers).toBe("weather");
});

it("refuses an unknown source tag", () => {
  const data = new FormData();
  data.append("manualText", "note");
  data.append("manualUrl", "");
  data.append("manualTime", "");
  data.append("manualCovers", "odds");
  expect(parseManualEvidence(data)).toMatchObject({
    ok: false,
    error: expect.stringMatching(/source tag/),
  });
});
```

`tests/store-contract.ts`:

```ts
it("labels a journal entry that relies on manual evidence", async () => {
  const store = makeStore();
  const outcome = await runAnalysis(
    request({
      manualEvidence: [
        { text: "Kickoff 52F", url: "", sourceTime: "2026-10-25T14:00:00.000Z", covers: "weather" },
      ],
    }),
    {
      store,
      collect: async () => ({
        items: [],
        gaps: ["Weather was not collected."],
        materialGaps: [{ kind: "weather", text: "Weather was not collected." }],
      }),
    },
  );
  const listed = (await store.listCompleted()).find((summary) => summary.id === outcome.run!.id);
  expect(listed?.reliesOnManualEvidence).toBe(true);
});
```

`tests/e2e/research-flow.spec.ts`: in the main flow, before submitting, fill the first manual row with a forecast note, time `2026-10-25T11:30` (POCKETCHECK_NOW is 12:00 ET), and `selectOption("weather")` on `getByTestId("manual-covers")`. After submitting, assert:

```ts
await expect(page.getByTestId("manual-coverage")).toContainText("kickoff forecast");
```

If the existing flow already fills manual evidence for the after-cutoff exclusion check, add the tagged row as a second row with the "Add another" button instead of changing the first.

**Step 2: Run tests to verify they fail**

Run: `npx vp test src/lib/server/analysis/form.test.ts && npm run -s test:integration && npx playwright test`
Expected: FAIL (no `covers`, no `reliesOnManualEvidence`, no `manual-covers` control).

**Step 3: Write minimal implementation**

- `form.ts`: `ManualEvidenceRow` gains `covers: string`. Read `all("manualCovers")`, include `covers: covers[index] ?? ""` in each row, validate with `if (row.covers && row.covers !== "injury-report" && row.covers !== "weather") return { ok: false, rows, error: \`Manual evidence ${index + 1}: unknown source tag\` }`, and push `...(row.covers ? { covers: row.covers as MaterialGapKind } : {})` into the entry.
- `+page.svelte` manual row, after the Published field:

```svelte
          <label>
            Stands in for
            <select name="manualCovers" value={row.covers ?? ""} data-testid="manual-covers">
              <option value="">nothing (extra context)</option>
              <option value="injury-report">a missing injury report (last 24 hours)</option>
              <option value="weather">a missing kickoff forecast (last 12 hours)</option>
            </select>
          </label>
```

- Report page, in the Conclusion section after the label:

```svelte
      {#if run.policy.reliesOnManualEvidence}
        <p data-testid="manual-coverage">
          This conclusion relies on your manual evidence for the
          {run.policy.manualCoverage
            .map((coverage) => (coverage.kind === "weather" ? "kickoff forecast" : "injury report"))
            .join(" and ")}.
        </p>
      {/if}
```

- `store.ts`: `RunSummary` gains `reliesOnManualEvidence: boolean`; `summarize` sets `run.policy?.reliesOnManualEvidence ?? false`.
- `repository.ts` `listCompletedSummaries`: select `COALESCE((a.policy->>'reliesOnManualEvidence')::boolean, false) AS relies_on_manual_evidence`, type it `relies_on_manual_evidence: boolean`, and map `reliesOnManualEvidence: row.relies_on_manual_evidence`.
- Journal list item: `{#if assessment.reliesOnManualEvidence}<span>(relies on manual evidence)</span>{/if}`.

**Step 4: Run tests to verify they pass**

Run: `npx vp test && npm run -s test:integration && npx svelte-check --threshold error && npx playwright test`
Expected: all PASS, `0 ERRORS`.

**Step 5: Commit**

```bash
git add src tests
git commit -m "feat: tag manual evidence to a missing source and label reliance in the report and journal"
```

---

## Phase D — Refit, document, verify

### Task 10: Refit, live check, docs

**Files:**

- Modify: `docs/research/model-evaluation.md` (new "Uncertainty" and "Value threshold" sections; Limits)
- Modify: `README.md` (next step; remove the three release items)
- Local only: `data/artifacts/baseline.json` (gitignored)

**Step 1: Refit and evaluate**

```bash
npm run -s model:fit -- data/sources/games.csv data/artifacts/baseline.json 2022-03-01T00:00:00Z
npm run -s model:evaluate -- data/artifacts/baseline.json data/sources/games.csv data/artifacts/baseline-evaluation.json
```

Expected: `release` still refuses all three markets. Record for the docs, per market: populated calibration bins, sides, the `threshold` block (assessed, candidates, observed rate against mean break-even, interval), and each baseline's `logLossDifferenceInterval`. Note whether each interval excludes 0. That says whether the model's loss to the market is clear or within slate noise.

**Step 2: Live check** (memory journal, fixture drafter, no paid calls)

```bash
POCKETCHECK_JOURNAL=memory POCKETCHECK_WEATHER=off npm run dev -- --port 5199 --host 127.0.0.1
```

Submit an upcoming game with a manual forecast tagged "Stands in for: kickoff forecast", dated within 12 hours. Confirm:

- The gaps say the forecast comes from manual evidence.
- The conclusion still blocks on the model, because the market is unreleased.
- The journal shows "(relies on manual evidence)".

Stop the server by its PID. Do not `pkill -f` a pattern that also matches your own shell.

**Step 3: Docs**

- `model-evaluation.md`: describe D1–D4 with the recorded numbers. State that the threshold is frozen in `src/lib/domain/threshold.ts`, that the evaluation is descriptive because it uses closing prices, and that uncertainty comes only from walk-forward forecasts inside the training window.
- README next step: replace the "uncertainty assessment" line with what remains (beating the market; injury-report starter changes).

**Step 4: Full verification**

```bash
npx vp check --fix && npx vp check
npx vp test
npm run -s test:integration
npx svelte-check --threshold error
npm run -s build
npx playwright test
```

Expected: all pass. Report the counts.

**Step 5: Commit**

```bash
git add docs README.md
git commit -m "docs: record calibration uncertainty, the frozen value threshold, and manual coverage"
```

---

## Risks and how the plan handles them

- **Old runs in the journal** were saved with `policy-2026-10-25` decisions that lack `uncertainty`, `threshold`, and `manualCoverage`. The report guards with optional chaining (Task 6), `summarize` and the SQL default `reliesOnManualEvidence` to false (Task 9), and the append-only triggers mean old rows are never rewritten.
- **Artifact version 3 on disk** is refused with a "refit" message by `SUPPORTED_VERSION = 4` (Task 2). Task 10 refits it.
- **Bootstrap cost** is 20 bins × 3 markets × 1,000 resamples over about 600 slates, a few seconds at fit time and none at run time. If `npm run model:fit` exceeds about 30 s, keep the seed and lower `resamples` to 500, which also needs a version bump of `UNCERTAINTY_OPTIONS` through the artifact.
- **Sparse bins**: extreme probabilities (under 20% or over 80% decisive) will often have fewer than 60 sides. The policy then says "uncertainty unavailable" rather than extrapolating, which is the intended conservative behavior.
