import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";
import { parseArtifact } from "../../src/lib/server/models/inputs.ts";
import { fitArtifact, readGames } from "../../src/lib/server/models/train.ts";

const directory = mkdtempSync(join(tmpdir(), "pocketcheck-inputs-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const artifact = fitArtifact(
  readGames(resolve("tests/model/fixtures/synthetic-games.json")),
  "2024-09-15T20:00:00Z",
);
const empty = {
  assessed: 0,
  candidates: 0,
  decisive: 0,
  wins: 0,
  observedRate: null,
  meanBreakEven: null,
  interval: null,
};
function report() {
  return {
    version: 1,
    artifactChecksum: artifact.checksum,
    datasetHash: artifact.datasetHash,
    trainingCutoff: artifact.trainingCutoff,
    holdoutGames: 600,
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
        markets: { moneyline: empty, spread: empty, total: empty },
      },
    },
  };
}
function release(value: unknown, model: unknown = artifact, previous?: string) {
  const artifactPath = join(directory, "artifact.json");
  const reportPath = join(directory, "report.json");
  const output = join(directory, "released.json");
  writeFileSync(artifactPath, JSON.stringify(model));
  writeFileSync(reportPath, JSON.stringify(value));
  rmSync(output, { force: true });
  if (previous !== undefined) writeFileSync(output, previous);
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      resolve("scripts/model/release.ts"),
      artifactPath,
      reportPath,
      output,
    ],
    { encoding: "utf8" },
  );
  expect(result.error).toBeUndefined();
  return { ...result, output };
}
function signed(body: object) {
  return {
    ...body,
    checksum: createHash("sha256").update(JSON.stringify(body)).digest("hex"),
  };
}

// Each case starts the release script in a new Node process, which is slow on a busy machine.
describe("public release input boundary", { timeout: 30_000 }, () => {
  it.each([null, [], {}, "invalid"])("rejects malformed report root %j", (value) => {
    const result = release(value);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toMatch(/Invalid evaluation/);
    expect(existsSync(result.output)).toBe(false);
  });

  it("rejects null evaluation scores without creating or replacing output", () => {
    const invalid = report();
    const value = {
      ...invalid,
      summary: {
        ...invalid.summary,
        baselines: invalid.summary.baselines.map((entry) => ({
          ...entry,
          model: { brier: null, logLoss: null },
        })),
      },
    };
    const fresh = release(value);
    expect(fresh.status, fresh.stderr).toBe(1);
    expect(existsSync(fresh.output)).toBe(false);
    const existing = release(value, artifact, "previous release");
    expect(existing.status, existing.stderr).toBe(1);
    expect(readFileSync(existing.output, "utf8")).toBe("previous release");
  });

  it.each([undefined, null, -1, Number.NaN, Infinity, "0.1"])(
    "rejects required metric %s",
    (metric) => {
      const value = report();
      const invalid = {
        ...value,
        summary: { ...value.summary, brier: metric },
      };
      const result = release(invalid);
      expect(result.status, result.stderr).toBe(1);
      expect(existsSync(result.output)).toBe(false);
    },
  );

  it.each([
    ["unsupported version", { version: 99 }],
    ["missing version", { version: undefined }],
    ["different artifact", { artifactChecksum: "0".repeat(64) }],
    ["different dataset", { datasetHash: "0".repeat(64) }],
    ["different cutoff", { trainingCutoff: "2025-01-01T00:00:00Z" }],
    ["invalid cutoff", { trainingCutoff: "yesterday" }],
    ["invalid holdout count", { holdoutGames: -1 }],
  ])("rejects %s", (_name, patch) => {
    const result = release({ ...report(), ...patch });
    expect(result.status, result.stderr).toBe(1);
    expect(existsSync(result.output)).toBe(false);
  });

  it("rejects incomplete markets, duplicate baselines, and inconsistent counts", () => {
    const value = report();
    for (const summary of [
      { ...value.summary, byMarket: { moneyline: { count: 600, brier: 0.4 } } },
      {
        ...value.summary,
        baselines: [...value.summary.baselines, value.summary.baselines[0]],
      },
      { ...value.summary, count: 1799 },
      { ...value.summary, coverage: { priced: 1801, missingPrices: 0 } },
      {
        ...value.summary,
        baselines: value.summary.baselines.map((entry) => ({
          ...entry,
          count: 600.5,
        })),
      },
      {
        ...value.summary,
        threshold: {
          ...value.summary.threshold,
          markets: {
            ...value.summary.threshold.markets,
            spread: { ...empty, wins: 1 },
          },
        },
      },
    ]) {
      const result = release({ ...value, summary });
      expect(result.status, result.stderr).toBe(1);
      expect(existsSync(result.output)).toBe(false);
    }
  }, 20_000);

  it("rejects unsupported market records", () => {
    const value = report();
    const result = release({
      ...value,
      summary: {
        ...value.summary,
        byMarket: { ...value.summary.byMarket, unknown: null },
      },
    });
    expect(result.status, result.stderr).toBe(1);
    expect(existsSync(result.output)).toBe(false);
  });

  it.each(["overall", "baseline"])("rejects inconsistent %s Brier scores", (kind) => {
    const value = report();
    const summary =
      kind === "overall"
        ? { ...value.summary, brier: 0.1 }
        : {
            ...value.summary,
            baselines: value.summary.baselines.map((entry) => ({
              ...entry,
              model: { ...entry.model, brier: 0.1 },
            })),
          };
    const result = release({ ...value, summary });
    expect(result.status, result.stderr).toBe(1);
    expect(existsSync(result.output)).toBe(false);
  });

  it("rejects checksum-valid artifacts with missing chronology at parsing", () => {
    const { chronology: _chronology, checksum: _checksum, ...body } = artifact;
    expect(() => parseArtifact(signed(body))).toThrow(/chronology/);
  });

  it("rejects checksum-valid artifacts with missing chronology at public release", () => {
    const { chronology: _chronology, checksum: _checksum, ...body } = artifact;
    const malformed = signed(body);
    const result = release(
      { ...report(), artifactChecksum: malformed.checksum },
      malformed,
      "previous release",
    );
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toMatch(/chronology/);
    expect(readFileSync(result.output, "utf8")).toBe("previous release");
  });

  it("checks shape even when the artifact checksum matches", () => {
    const { checksum: _checksum, ...body } = artifact;
    const malformed = signed({ ...body, trainingCutoff: "invalid" });
    const result = release({ ...report(), artifactChecksum: malformed.checksum }, malformed);
    expect(result.status, result.stderr).toBe(1);
    expect(existsSync(result.output)).toBe(false);
  });

  it("refuses a valid historical report, including zero scores and losing evidence, without writing a release", () => {
    const value = report();
    const zero = {
      ...value,
      summary: {
        ...value.summary,
        brier: 0,
        logLoss: 0,
        byMarket: {
          moneyline: { count: 600, brier: 0 },
          spread: { count: 600, brier: 0 },
          total: { count: 600, brier: 0 },
        },
        baselines: value.summary.baselines.map((entry) => ({
          ...entry,
          model: { brier: 0, logLoss: 0 },
        })),
      },
    };
    const passing = release(zero);
    expect(passing.status, passing.stderr).toBe(1);
    expect(passing.stderr).toMatch(/Independent prospective evidence is missing or failed/);
    expect(existsSync(passing.output)).toBe(false);
    const losing = release({
      ...value,
      summary: {
        ...value.summary,
        brier: 0.9,
        logLoss: 1,
        byMarket: {
          moneyline: { count: 600, brier: 0.9 },
          spread: { count: 600, brier: 0.9 },
          total: { count: 600, brier: 0.9 },
        },
        baselines: value.summary.baselines.map((entry) => ({
          ...entry,
          model: { brier: 0.9, logLoss: 1 },
        })),
      },
    });
    expect(losing.status, losing.stderr).toBe(1);
    expect(losing.stderr).toMatch(/No market passed/);
    expect(existsSync(losing.output)).toBe(false);
  });
});
