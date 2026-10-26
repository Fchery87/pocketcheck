import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { valueEligibility } from "../../src/lib/server/models/artifact.ts";
import type {
  BaselineComparison,
  EvaluationSummary,
} from "../../src/lib/server/models/evaluate.ts";
import type { PricedGame } from "../../src/lib/server/models/games.ts";
import {
  RELEASE_GATE,
  releaseArtifact,
  releaseDecision,
  releaseUnderProtocol,
} from "../../src/lib/server/models/release.ts";
import { fitArtifact } from "../../src/lib/server/models/train.ts";

function comparison(
  market: BaselineComparison["market"],
  count: number,
  model: [number, number],
  baseline: [number, number],
): BaselineComparison {
  return {
    market,
    name: "market-no-vig",
    count,
    model: { brier: model[0], logLoss: model[1] },
    baseline: { brier: baseline[0], logLoss: baseline[1] },
    logLossDifferenceInterval: null,
  };
}

function summary(baselines: BaselineComparison[]): EvaluationSummary {
  return {
    count: 0,
    brier: 0,
    logLoss: 0,
    calibration: [],
    baselines: [
      {
        market: "moneyline",
        name: "training-base-rate",
        count: 900,
        model: { brier: 0.1, logLoss: 0.1 },
        baseline: { brier: 0.9, logLoss: 0.9 },
        logLossDifferenceInterval: null,
      },
      ...baselines,
    ],
    coverage: { priced: 0, missingPrices: 0 },
    byMarket: {},
    threshold: {
      version: "threshold-2026-10-25",
      conservativeExpectedValue: 0,
      note: "",
      markets: {
        moneyline: {
          assessed: 0,
          candidates: 0,
          decisive: 0,
          wins: 0,
          observedRate: null,
          meanBreakEven: null,
          interval: null,
        },
        spread: {
          assessed: 0,
          candidates: 0,
          decisive: 0,
          wins: 0,
          observedRate: null,
          meanBreakEven: null,
          interval: null,
        },
        total: {
          assessed: 0,
          candidates: 0,
          decisive: 0,
          wins: 0,
          observedRate: null,
          meanBreakEven: null,
          interval: null,
        },
      },
    },
  };
}

describe("release gate", () => {
  it("labels a clean historical comparison as development evidence and does not release it", () => {
    const decision = releaseDecision(
      summary([
        comparison("moneyline", 600, [0.42, 0.63], [0.43, 0.64]),
        comparison("spread", 600, [0.54, 0.79], [0.52, 0.77]),
        comparison("total", 600, [0.5, 0.7], [0.5, 0.7]),
      ]),
    );
    expect(decision.moneyline.released).toBe(false);
    expect(decision.moneyline.reason).toMatch(/Development evidence/);
    expect(decision.moneyline.reason).toMatch(/does not release/);
    expect(decision.spread.released).toBe(false);
    expect(decision.spread.reason).toMatch(
      /log loss 0\.7900 is worse than the market's 0\.7700/,
    );
    expect(decision.total.released).toBe(false);
    expect(decision.total.reason).toMatch(/Development evidence/);
  });

  it("needs both scores to hold, and enough priced games", () => {
    const decision = releaseDecision(
      summary([
        comparison("moneyline", 600, [0.44, 0.6], [0.43, 0.64]),
        comparison(
          "spread",
          RELEASE_GATE.minimumPricedGames - 1,
          [0.4, 0.6],
          [0.5, 0.7],
        ),
      ]),
    );
    expect(decision.moneyline.released).toBe(false);
    expect(decision.moneyline.reason).toMatch(/Brier/);
    expect(decision.spread.released).toBe(false);
    expect(decision.spread.reason).toMatch(/499 priced holdout games/);
    expect(decision.total).toMatchObject({
      released: false,
      reason: expect.stringMatching(/no priced/),
    });
  });

  it("ignores the base-rate baseline, which the model can beat while losing to the market", () => {
    const decision = releaseDecision(summary([]));
    expect(Object.values(decision).every((market) => !market.released)).toBe(
      true,
    );
  });
});

describe("releasing an artifact", () => {
  const games = JSON.parse(
    readFileSync(
      new URL("./fixtures/synthetic-games.json", import.meta.url),
      "utf8",
    ),
  ).games as PricedGame[];
  const artifact = fitArtifact(games, "2024-09-15T20:00:00Z");
  const passing = summary([
    comparison("moneyline", 600, [0.42, 0.63], [0.43, 0.64]),
  ]);

  it("refuses to release from development evidence even when the holdout comparison is clean", () => {
    expect(() =>
      releaseArtifact(artifact, {
        version: 1,
        datasetHash: artifact.datasetHash,
        trainingCutoff: artifact.trainingCutoff,
        holdoutGames: 900,
        artifactChecksum: artifact.checksum,
        summary: passing,
      }),
    ).toThrow(/Independent prospective evidence is missing or failed/);
    expect(artifact.releaseStatus).toBe("unreleased");
    expect(valueEligibility(artifact, "moneyline").eligible).toBe(false);
  });

  it("refuses an evaluation of a different artifact", () => {
    expect(() =>
      releaseArtifact(artifact, {
        version: 1,
        datasetHash: artifact.datasetHash,
        trainingCutoff: artifact.trainingCutoff,
        holdoutGames: 900,
        artifactChecksum: "0".repeat(64),
        summary: passing,
      }),
    ).toThrow(/different artifact/);
  });

  it("does not treat an inspected historical holdout as independent release evidence", () => {
    const protocol = {
      id: "prospective-2026-10-26",
      role: "independent" as const,
      artifactChecksum: artifact.checksum,
      inputAvailability: "decision-time-starters-v1",
      markets: ["moneyline"] as const,
      period: { start: "2026-10-26T00:00:00Z", end: null },
      minimumPricedGames: 500,
      uncertainty: "slate-clustered-90-log-loss-difference",
      criteria: "no-worse-brier-and-log-loss-and-interval-upper-at-most-zero",
      frozenBeforeOutcomes: true,
    };
    const result = releaseUnderProtocol({
      artifact,
      protocol,
      development: {
        role: "development",
        summary: passing,
      },
      prospective: null,
    });
    expect(result.released).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/development/i);
    expect(result.reasons.join(" ")).toMatch(/independent/i);
    expect(artifact.releaseStatus).toBe("unreleased");
  });

  it("refuses when no market passes, leaving the artifact unreleased", () => {
    expect(() =>
      releaseArtifact(artifact, {
        version: 1,
        datasetHash: artifact.datasetHash,
        trainingCutoff: artifact.trainingCutoff,
        holdoutGames: 900,
        artifactChecksum: artifact.checksum,
        summary: summary([]),
      }),
    ).toThrow(/No market passed/);
    expect(artifact.releaseStatus).toBe("unreleased");
    expect(artifact.releasedMarkets).toEqual([]);
    expect(valueEligibility(artifact, "moneyline").eligible).toBe(false);
  });
});
