import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vite-plus/test";
import {
  ablateGroup,
  compareArtifacts,
  multiclassLogLoss,
  type ScoredForecast,
} from "../../src/lib/server/models/evaluate.ts";
import { parseEvaluationReport } from "../../src/lib/server/models/inputs.ts";
import { fitArtifact, readGames } from "../../src/lib/server/models/train.ts";

const games = readGames(resolve("tests/model/fixtures/synthetic-games.json"));
const artifact = fitArtifact(games, "2024-09-15T20:00:00Z");

function forecast(
  gameId: string,
  win: number,
  outcome: ScoredForecast["outcome"],
  slate: string,
): ScoredForecast {
  return {
    gameId,
    market: "moneyline",
    side: "home",
    probability: { win, loss: 1 - win, push: 0 },
    marketBaseline: null,
    baseRate: null,
    outcome,
    priceState: "present",
    slate,
    americanOdds: -110,
    conservativeExpectedValue: null,
  };
}

describe("artifact comparison", () => {
  const candidate = [forecast("g1", 0.8, "win", "2024-09"), forecast("g2", 0.7, "win", "2024-10")];
  const previous = [forecast("g1", 0.4, "win", "2024-09"), forecast("g2", 0.4, "win", "2024-10")];

  it("compares two artifacts on the same games and labels the result development evidence", () => {
    const comparison = compareArtifacts(candidate, previous, "b".repeat(64));
    expect(comparison.evidence).toBe("development");
    const moneyline = comparison.markets.find((market) => market.market === "moneyline");
    expect(moneyline?.count).toBe(2);
    expect(moneyline!.candidate.logLoss).toBeLessThan(moneyline!.previous.logLoss);
    expect(moneyline?.logLossDifferenceInterval).not.toBeNull();
  });

  it("refuses a comparison when the game sets differ", () => {
    expect(() => compareArtifacts(candidate, previous.slice(0, 1), "b".repeat(64))).toThrow(
      /same games/,
    );
  });
});

describe("input group ablation", () => {
  it("shows a gain when a planted signal is removed", () => {
    // The group predicts the outcomes. Without it, every forecast is a coin flip.
    const withGroup = [
      forecast("g1", 0.9, "win", "2024-09"),
      forecast("g2", 0.1, "loss", "2024-10"),
    ];
    const withoutGroup = [
      forecast("g1", 0.5, "win", "2024-09"),
      forecast("g2", 0.5, "loss", "2024-10"),
    ];
    const ablation = ablateGroup({
      group: "planted",
      features: ["planted_signal"],
      withGroup,
      withoutGroup,
    });
    const moneyline = ablation.markets[0]!;
    const gain = moneyline.withoutGroup.logLoss - moneyline.withGroup.logLoss;
    expect(gain).toBeGreaterThan(0);
    expect(gain).toBeCloseTo(
      multiclassLogLoss(withoutGroup[0]!.probability, "win") -
        multiclassLogLoss(withGroup[0]!.probability, "win"),
      9,
    );
  });

  it("refuses an ablation that drops a game", () => {
    expect(() =>
      ablateGroup({
        group: "planted",
        features: ["planted_signal"],
        withGroup: [forecast("g1", 0.9, "win", "2024-09")],
        withoutGroup: [],
      }),
    ).toThrow(/same games/);
  });
});

describe("evaluation report sections", () => {
  function report() {
    return {
      version: 1,
      artifactChecksum: artifact.checksum,
      datasetHash: artifact.datasetHash,
      trainingCutoff: artifact.trainingCutoff,
      holdoutGames: 600,
      evidence: "development",
      summary: {
        count: 1800,
        brier: 0.4,
        logLoss: 0.6,
        calibration: [{ lower: 0, upper: 1, count: 1800, observed: 0.5 }],
        baselines: ["moneyline", "spread", "total"].map((market) => ({
          market,
          name: "market-no-vig",
          count: 600,
          model: { brier: 0.4, logLoss: 0.6 },
          baseline: { brier: 0.5, logLoss: 0.7 },
          logLossDifferenceInterval: [-0.2, 0],
        })),
        coverage: { priced: 1800, missingPrices: 0 },
        byMarket: {
          moneyline: { count: 600, brier: 0.4 },
          spread: { count: 600, brier: 0.4 },
          total: { count: 600, brier: 0.4 },
        },
        threshold: {
          version: "threshold-2026-10-25",
          conservativeExpectedValue: 0,
          note: "fixture",
          markets: {
            moneyline: empty(),
            spread: empty(),
            total: empty(),
          },
        },
      },
      comparison: {
        previousChecksum: "c".repeat(64),
        evidence: "development",
        markets: ["moneyline", "spread", "total"].map((market) => ({
          market,
          count: 600,
          candidate: { brier: 0.4, logLoss: 0.6 },
          previous: { brier: 0.5, logLoss: 0.7 },
          logLossDifferenceInterval: [-0.2, 0],
        })),
      },
      ablation: [
        {
          group: "planted",
          features: ["planted_signal"],
          markets: ["moneyline", "spread", "total"].map((market) => ({
            market,
            count: 600,
            withGroup: { brier: 0.4, logLoss: 0.6 },
            withoutGroup: { brier: 0.5, logLoss: 0.8 },
            logLossDifferenceInterval: [-0.3, -0.1],
          })),
        },
      ],
    };
  }

  function empty() {
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

  it("accepts a report that labels its history as development evidence", () => {
    expect(parseEvaluationReport({ value: report(), artifact }).artifactChecksum).toBe(
      artifact.checksum,
    );
  });

  it("rejects a comparison that covers a different number of games", () => {
    const value = report();
    value.comparison.markets[0]!.count = 12;
    expect(() => parseEvaluationReport({ value, artifact })).toThrow(/same games/);
  });

  it("rejects a comparison presented as release evidence", () => {
    const value = report();
    value.comparison.evidence = "released";
    expect(() => parseEvaluationReport({ value, artifact })).toThrow(/development evidence/);
  });

  it("rejects an ablation with no features", () => {
    const value = report();
    value.ablation[0]!.features = [];
    expect(() => parseEvaluationReport({ value, artifact })).toThrow(/features/);
  });
});

describe("model:evaluate report", () => {
  const directory = mkdtempSync(join(tmpdir(), "pocketcheck-evaluate-"));
  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  function evaluate(previous?: string, previousGames?: string) {
    const artifactPath = join(directory, "artifact.json");
    const output = join(directory, "report.json");
    const fitted = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        resolve("scripts/model/fit.ts"),
        resolve("tests/model/fixtures/synthetic-games.json"),
        artifactPath,
        "2024-09-15T20:00:00Z",
      ],
      { encoding: "utf8" },
    );
    expect(fitted.status, fitted.stderr).toBe(0);
    const evaluated = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        resolve("scripts/model/evaluate.ts"),
        artifactPath,
        resolve("tests/model/fixtures/synthetic-games.json"),
        output,
        ...(previous && previousGames ? [previous, previousGames] : []),
      ],
      { encoding: "utf8" },
    );
    return { ...evaluated, output };
  }

  it("labels the report as development evidence and ablates every input group", () => {
    const result = evaluate();
    expect(result.status, result.stderr).toBe(0);
    const written = JSON.parse(readFileSync(result.output, "utf8")) as {
      evidence: string;
      ablation: {
        group: string;
        markets: { logLossDifferenceInterval: [number, number] | null }[];
      }[];
      comparison: unknown;
    };
    expect(written.evidence).toBe("development");
    expect(written.comparison).toBeNull();
    expect(written.ablation.map((group) => group.group)).toEqual([
      "score margin",
      "points scored and allowed",
      "rest",
      "quarterback",
      "home field",
      "quarterback efficiency",
      "team efficiency",
      "pace",
      "situational",
    ]);
  });

  it(
    "refuses a comparison when the previous artifact covers different games",
    { timeout: 30_000 },
    () => {
      const full = JSON.parse(
        readFileSync(resolve("tests/model/fixtures/synthetic-games.json"), "utf8"),
      ) as { games: { id: string }[] };
      const shorter = join(directory, "shorter.json");
      writeFileSync(shorter, JSON.stringify({ games: full.games.slice(0, -1) }));
      const other = join(directory, "other.json");
      const fitted = spawnSync(
        process.execPath,
        [
          "--experimental-strip-types",
          resolve("scripts/model/fit.ts"),
          shorter,
          other,
          "2024-09-15T20:00:00Z",
        ],
        { encoding: "utf8" },
      );
      expect(fitted.status, fitted.stderr).toBe(0);
      rmSync(join(directory, "report.json"), { force: true });
      const result = evaluate(other, shorter);
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toMatch(/same games/);
      expect(existsSync(result.output)).toBe(false);
    },
  );
});
