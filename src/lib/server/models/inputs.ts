import { artifactChecksum, type ModelArtifact } from "./artifact.ts";
import type { EvaluationReport } from "./evaluate.ts";
import { FEATURE_DEFINITIONS, INPUT_GROUPS } from "./features.ts";
import { CHRONOLOGY } from "./games.ts";
import { UNCERTAINTY_OPTIONS } from "./uncertainty.ts";

const MARKETS = ["moneyline", "spread", "total"] as const;

function requireValue(condition: boolean, path: string, expected: string): asserts condition {
  if (!condition) throw new Error(`Invalid ${path}: ${expected}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  requireValue(isRecord(value), path, "expected an object");
  return value;
}

function array(value: unknown, path: string): unknown[] {
  requireValue(Array.isArray(value), path, "expected an array");
  return value;
}

function number(value: unknown, path: string, minimum = -Infinity, maximum = Infinity): number {
  requireValue(
    typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum,
    path,
    `expected a finite number between ${minimum} and ${maximum}`,
  );
  return value;
}

function count(value: unknown, path: string, minimum = 0): number {
  const parsed = number(value, path, minimum);
  requireValue(Number.isSafeInteger(parsed), path, "expected a whole count");
  return parsed;
}

function text(value: unknown, path: string): string {
  requireValue(typeof value === "string", path, "expected a string");
  return value;
}

function hash(value: unknown, path: string): string {
  const parsed = text(value, path);
  requireValue(/^[a-f0-9]{64}$/.test(parsed), path, "expected a SHA-256 checksum");
  return parsed;
}

function timestamp(value: unknown, path: string): number {
  const parsed = text(value, path);
  requireValue(
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(parsed) &&
      Number.isFinite(Date.parse(parsed)),
    path,
    "expected an ISO timestamp with timezone",
  );
  return Date.parse(parsed);
}

function probability(value: unknown, path: string): number {
  return number(value, path, 0, 1);
}

function nullableProbability(value: unknown, path: string): number | null {
  return value === null ? null : probability(value, path);
}

function interval(value: unknown, path: string, probabilities = false): void {
  if (value === null) return;
  const bounds = array(value, path);
  requireValue(bounds.length === 2, path, "expected two interval endpoints");
  const low = number(bounds[0], path, probabilities ? 0 : -Infinity, probabilities ? 1 : Infinity);
  const high = number(bounds[1], path, probabilities ? 0 : -Infinity, probabilities ? 1 : Infinity);
  requireValue(low <= high, path, "interval endpoints are reversed");
}

function scores(value: unknown, path: string): { brier: number; logLoss: number } {
  const parsed = record(value, path);
  return {
    brier: number(parsed.brier, `${path}.brier`, 0, 2),
    logLoss: number(parsed.logLoss, `${path}.logLoss`, 0),
  };
}

function modelSide(value: unknown, path: string): void {
  const side = record(value, path);
  const model = record(side.model, `${path}.model`);
  number(model.intercept, `${path}.model.intercept`);
  for (const field of ["coefficients", "featureMeans", "featureScales"]) {
    const values = record(model[field], `${path}.model.${field}`);
    for (const feature of FEATURE_DEFINITIONS) {
      const parsed = number(values[feature.name], `${path}.model.${field}.${feature.name}`);
      if (field === "featureScales")
        requireValue(parsed > 0, path, "feature scales must be positive");
    }
  }
  const residuals = record(side.residuals, `${path}.residuals`);
  const values = array(residuals.residuals, `${path}.residuals.residuals`);
  requireValue(values.length > 0, path, "residuals must be nonempty");
  const support = record(residuals.support, `${path}.residuals.support`);
  const low = number(support.min, `${path}.support.min`);
  const high = number(support.max, `${path}.support.max`);
  requireValue(low < high, path, "residual support must increase");
  for (const value of values) {
    const residual = number(value, `${path}.residual`);
    requireValue(residual >= low && residual <= high, path, "support must contain all residuals");
  }
  requireValue(
    number(residuals.bandwidth, `${path}.bandwidth`, 0) > 0,
    path,
    "bandwidth must be positive",
  );
  const points = new Set<number>();
  for (const value of array(residuals.keyWeights, `${path}.keyWeights`)) {
    const weight = record(value, `${path}.keyWeights`);
    const point = number(weight.points, `${path}.keyWeights.points`);
    requireValue(
      Number.isSafeInteger(point) && !points.has(point),
      path,
      "key points must be unique integers",
    );
    points.add(point);
    requireValue(
      number(weight.weight, `${path}.keyWeights.weight`, 0) > 0,
      path,
      "key weights must be positive",
    );
  }
}

function isModelArtifact(value: unknown): value is ModelArtifact {
  const artifact = record(value, "artifact");
  requireValue(artifact.kind === "pocketcheck-baseline", "artifact.kind", "unsupported model kind");
  requireValue(
    artifact.version === 6,
    "artifact.version",
    `version ${String(artifact.version)} is not supported. Refit required: run npm run model:fit`,
  );
  const anchor = record(artifact.anchor, "artifact.anchor");
  requireValue(
    anchor.history === "recorded close" &&
      anchor.decisionTime === "one sportsbook's two sides" &&
      typeof anchor.definition === "string",
    "artifact.anchor",
    "unsupported anchor definition",
  );
  const excluded = record(anchor.excludedNoClose, "artifact.anchor.excludedNoClose");
  for (const market of MARKETS) {
    count(excluded[market], `artifact.anchor.excludedNoClose.${market}`);
  }
  hash(artifact.checksum, "artifact.checksum");
  hash(artifact.datasetHash, "artifact.datasetHash");
  timestamp(artifact.trainingCutoff, "artifact.trainingCutoff");
  const chronology = record(artifact.chronology, "artifact.chronology");
  for (const [field, expected] of Object.entries(CHRONOLOGY)) {
    requireValue(
      chronology[field] === expected,
      `artifact.chronology.${field}`,
      "unsupported chronology policy",
    );
  }
  const released = array(artifact.releasedMarkets, "artifact.releasedMarkets");
  requireValue(
    released.every((market) => MARKETS.some((known) => known === market)) &&
      new Set(released).size === released.length,
    "artifact.releasedMarkets",
    "expected unique supported markets",
  );
  requireValue(
    (artifact.releaseStatus === "unreleased" && released.length === 0) ||
      (artifact.releaseStatus === "released-experimental" && released.length > 0),
    "artifact.releaseStatus",
    "release status and markets must agree",
  );
  requireValue(
    artifact.residualSource === "walk-forward" || artifact.residualSource === "in-sample",
    "artifact.residualSource",
    "unsupported residual source",
  );
  const definitions = array(artifact.featureDefinitions, "artifact.featureDefinitions");
  requireValue(
    definitions.length === FEATURE_DEFINITIONS.length,
    "artifact.featureDefinitions",
    "feature definitions must match the artifact",
  );
  FEATURE_DEFINITIONS.forEach((feature, index) => {
    const definition = record(definitions[index], "artifact.featureDefinitions");
    requireValue(
      definition.name === feature.name && definition.description === feature.description,
      "artifact.featureDefinitions",
      "feature definitions must match the artifact",
    );
  });
  const features = record(artifact.featureParameters, "artifact.featureParameters");
  for (const key of ["gameDecay", "seasonCarry", "qbDecay"]) {
    requireValue(
      probability(features[key], `artifact.featureParameters.${key}`) > 0,
      "artifact.featureParameters",
      "decay factors must be positive",
    );
  }
  for (const key of ["priorWeight", "qbPriorWeight"]) {
    requireValue(
      number(features[key], `artifact.featureParameters.${key}`, 0) > 0,
      "artifact.featureParameters",
      "prior weights must be positive",
    );
  }
  number(features.qbReplacement, "artifact.featureParameters.qbReplacement");
  number(features.qbEfficiencyReplacement, "artifact.featureParameters.qbEfficiencyReplacement");
  for (const key of ["qbCpoeScale", "qbFullDropbacks", "turnoverRegression"]) {
    requireValue(
      number(features[key], `artifact.featureParameters.${key}`, 0) > 0,
      "artifact.featureParameters",
      "scales and regression weights must be positive",
    );
  }
  probability(features.opponentAdjustment, "artifact.featureParameters.opponentAdjustment");
  const excludedGroups = features.excludedGroups;
  requireValue(
    Array.isArray(excludedGroups) &&
      excludedGroups.every((name) => INPUT_GROUPS.some((group) => group.group === name)),
    "artifact.featureParameters.excludedGroups",
    "excluded groups must name input groups",
  );
  const fit = record(artifact.fitParameters, "artifact.fitParameters");
  number(fit.ridge, "artifact.fitParameters.ridge", 0);
  requireValue(
    number(fit.residualBandwidth, "artifact.fitParameters.residualBandwidth", 0) > 0,
    "artifact.fitParameters",
    "residual bandwidth must be positive",
  );
  count(fit.residualFolds, "artifact.fitParameters.residualFolds", 2);
  if (artifact.shrink !== undefined) {
    const shrink = record(artifact.shrink, "artifact.shrink");
    for (const market of ["margin", "total"] as const) {
      const value = number(shrink[market], `artifact.shrink.${market}`, 0);
      requireValue(value <= 1, "artifact.shrink", "a shrink factor is between 0 and 1");
    }
  }
  const base = record(
    record(artifact.baseRates, "artifact.baseRates").moneyline,
    "artifact.baseRates.moneyline",
  );
  const sum =
    probability(base.win, "artifact.baseRates.win") +
    probability(base.loss, "artifact.baseRates.loss") +
    probability(base.push, "artifact.baseRates.push");
  requireValue(Math.abs(sum - 1) < 1e-9, "artifact.baseRates", "probabilities must sum to one");
  modelSide(artifact.margin, "artifact.margin");
  modelSide(artifact.total, "artifact.total");
  const uncertainty = record(artifact.uncertainty, "artifact.uncertainty");
  requireValue(
    uncertainty.method === "walk-forward-calibration",
    "artifact.uncertainty.method",
    "unsupported calibration method",
  );
  const options = record(uncertainty.options, "artifact.uncertainty.options");
  for (const [key, expected] of Object.entries(UNCERTAINTY_OPTIONS)) {
    requireValue(
      options[key] === expected,
      `artifact.uncertainty.options.${key}`,
      "unsupported calibration option",
    );
  }
  const markets = record(uncertainty.markets, "artifact.uncertainty.markets");
  for (const market of MARKETS) {
    const bins = array(markets[market], `artifact.uncertainty.markets.${market}`);
    requireValue(
      bins.length === Math.round(1 / UNCERTAINTY_OPTIONS.binWidth),
      "artifact.uncertainty",
      "expected a complete calibration grid",
    );
    bins.forEach((value, index) => {
      const bin = record(value, "artifact.calibrationBin");
      const low = probability(bin.lower, "artifact.calibrationBin.lower");
      const high = probability(bin.upper, "artifact.calibrationBin.upper");
      requireValue(
        Math.abs(low - index * UNCERTAINTY_OPTIONS.binWidth) < 1e-9 &&
          Math.abs(high - (index + 1) * UNCERTAINTY_OPTIONS.binWidth) < 1e-9,
        "artifact.calibrationBin",
        "calibration bins must cover zero through one in order",
      );
      const sides = count(bin.sides, "artifact.calibrationBin.sides");
      const slates = count(bin.slates, "artifact.calibrationBin.slates");
      requireValue(
        slates <= sides && (sides === 0) === (slates === 0),
        "artifact.calibrationBin",
        "slate and side counts must agree",
      );
      const mean = nullableProbability(bin.meanPredicted, "artifact.calibrationBin.meanPredicted");
      const observed = nullableProbability(
        bin.observedRate,
        "artifact.calibrationBin.observedRate",
      );
      const conservative = nullableProbability(
        bin.conservativeRate,
        "artifact.calibrationBin.conservativeRate",
      );
      requireValue(
        sides === 0
          ? mean === null && observed === null
          : mean !== null && observed !== null && mean >= low - 1e-9 && mean <= high + 1e-9,
        "artifact.calibrationBin",
        "rates must agree with bin support",
      );
      requireValue(
        conservative === null ||
          (sides > 0 && slates >= 2 && observed !== null && conservative <= observed),
        "artifact.calibrationBin",
        "conservative rate requires sufficient calibration evidence",
      );
    });
  }
  return true;
}

/** Parses untrusted artifact JSON before prediction or evaluation. */
export function parseArtifact(value: unknown): ModelArtifact {
  if (!isModelArtifact(value)) throw new Error("Invalid artifact");
  const { checksum, ...body } = value;
  requireValue(
    artifactChecksum(body) === checksum,
    "artifact.checksum",
    "checksum does not match its contents",
  );
  return value;
}

function isEvaluationReport(value: unknown, artifact: ModelArtifact): value is EvaluationReport {
  const report = record(value, "evaluation");
  requireValue(
    report.version === 1,
    "evaluation.version",
    "unsupported report version. Rerun npm run model:evaluate",
  );
  requireValue(
    hash(report.artifactChecksum, "evaluation.artifactChecksum") === artifact.checksum,
    "evaluation.artifactChecksum",
    "evaluation is of a different artifact",
  );
  requireValue(
    hash(report.datasetHash, "evaluation.datasetHash") === artifact.datasetHash,
    "evaluation.datasetHash",
    "dataset does not match artifact",
  );
  requireValue(
    timestamp(report.trainingCutoff, "evaluation.trainingCutoff") ===
      Date.parse(artifact.trainingCutoff),
    "evaluation.trainingCutoff",
    "training cutoff does not match artifact",
  );
  const games = count(report.holdoutGames, "evaluation.holdoutGames", 1);
  const summary = record(report.summary, "evaluation.summary");
  const overall = scores(summary, "evaluation.summary");
  const total = count(summary.count, "evaluation.summary.count");
  const coverage = record(summary.coverage, "evaluation.coverage");
  const priced = count(coverage.priced, "evaluation.coverage.priced");
  const missing = count(coverage.missingPrices, "evaluation.coverage.missingPrices");
  requireValue(
    priced + missing === games * MARKETS.length &&
      total >= priced &&
      total <= games * MARKETS.length,
    "evaluation.coverage",
    "coverage and holdout counts must agree",
  );
  const byMarket = record(summary.byMarket, "evaluation.byMarket");
  requireValue(
    Object.keys(byMarket).length === MARKETS.length,
    "evaluation.byMarket",
    "expected only supported markets",
  );
  const marketCounts = new Map<string, number>();
  const marketBrier = new Map<string, number>();
  let weightedBrier = 0;
  for (const market of MARKETS) {
    const entry = record(byMarket[market], `evaluation.byMarket.${market}`);
    const n = count(entry.count, `evaluation.byMarket.${market}.count`);
    requireValue(
      n <= games && (market !== "moneyline" || n === games),
      "evaluation.byMarket",
      "market counts must agree with holdout games",
    );
    const brier = number(entry.brier, `evaluation.byMarket.${market}.brier`, 0, 2);
    weightedBrier += n * brier;
    marketBrier.set(market, brier);
    marketCounts.set(market, n);
  }
  requireValue(
    [...marketCounts.values()].reduce((sum, n) => sum + n, 0) === total,
    "evaluation.count",
    "market counts must sum to total",
  );
  requireValue(
    Math.abs(overall.brier - weightedBrier / total) < 1e-9,
    "evaluation.summary.brier",
    "overall score must agree with market scores",
  );
  let calibrated = 0;
  let previous = 0;
  for (const value of array(summary.calibration, "evaluation.calibration")) {
    const bin = record(value, "evaluation.calibrationBin");
    const lower = probability(bin.lower, "evaluation.calibrationBin.lower");
    const upper = probability(bin.upper, "evaluation.calibrationBin.upper");
    requireValue(
      lower === previous && upper > lower,
      "evaluation.calibration",
      "bins must cover zero through one in order",
    );
    previous = upper;
    calibrated += count(bin.count, "evaluation.calibrationBin.count");
    probability(bin.observed, "evaluation.calibrationBin.observed");
  }
  requireValue(
    previous === 1 && calibrated === total,
    "evaluation.calibration",
    "calibration counts must cover the sample",
  );
  const seen = new Set<string>();
  let pricedComparisons = 0;
  for (const value of array(summary.baselines, "evaluation.baselines")) {
    const entry = record(value, "evaluation.baseline");
    const market = text(entry.market, "evaluation.baseline.market");
    const n = marketCounts.get(market);
    requireValue(n !== undefined, "evaluation.baseline.market", "unsupported market");
    requireValue(
      entry.name === "market-no-vig" ||
        (entry.name === "training-base-rate" && market === "moneyline"),
      "evaluation.baseline.name",
      "unsupported baseline",
    );
    const key = `${market}/${String(entry.name)}`;
    requireValue(!seen.has(key), "evaluation.baselines", "duplicate baseline");
    seen.add(key);
    const sample = count(entry.count, "evaluation.baseline.count", 1);
    requireValue(sample <= n, "evaluation.baseline.count", "baseline count exceeds market count");
    if (entry.name === "market-no-vig") {
      pricedComparisons += sample;
      if (market !== "moneyline")
        requireValue(
          sample === n,
          "evaluation.baseline.count",
          "priced market count must match baseline",
        );
    }
    const model = scores(entry.model, "evaluation.baseline.model");
    if (sample === n) {
      requireValue(
        Math.abs(model.brier - (marketBrier.get(market) ?? 0)) < 1e-9,
        "evaluation.baseline.model.brier",
        "full-sample score must agree with market score",
      );
    }
    scores(entry.baseline, "evaluation.baseline.baseline");
    interval(entry.logLossDifferenceInterval, "evaluation.baseline.interval");
  }
  requireValue(
    pricedComparisons === priced,
    "evaluation.baselines",
    "baseline counts must account for priced forecasts",
  );
  const threshold = record(summary.threshold, "evaluation.threshold");
  requireValue(
    text(threshold.version, "evaluation.threshold.version").length > 0,
    "evaluation.threshold.version",
    "threshold identity is required",
  );
  number(threshold.conservativeExpectedValue, "evaluation.threshold.conservativeExpectedValue", 0);
  text(threshold.note, "evaluation.threshold.note");
  const thresholdMarkets = record(threshold.markets, "evaluation.threshold.markets");
  for (const market of MARKETS) {
    const entry = record(thresholdMarkets[market], `evaluation.threshold.${market}`);
    const assessed = count(entry.assessed, "evaluation.threshold.assessed");
    const candidates = count(entry.candidates, "evaluation.threshold.candidates");
    const decisive = count(entry.decisive, "evaluation.threshold.decisive");
    const wins = count(entry.wins, "evaluation.threshold.wins");
    requireValue(
      wins <= decisive &&
        decisive <= candidates &&
        candidates <= assessed &&
        assessed <= (marketCounts.get(market) ?? 0),
      "evaluation.threshold",
      "threshold counts must agree",
    );
    const observed = nullableProbability(entry.observedRate, "evaluation.threshold.observedRate");
    const breakEven = nullableProbability(
      entry.meanBreakEven,
      "evaluation.threshold.meanBreakEven",
    );
    requireValue(
      decisive === 0
        ? observed === null
        : observed !== null && Math.abs(observed - wins / decisive) < 1e-9,
      "evaluation.threshold.observedRate",
      "observed rate must match wins and decisive count",
    );
    requireValue(
      candidates === 0 ? breakEven === null : breakEven !== null,
      "evaluation.threshold.meanBreakEven",
      "break-even rate must agree with candidate count",
    );
    interval(entry.interval, "evaluation.threshold.interval", true);
    requireValue(
      decisive > 0 || entry.interval === null,
      "evaluation.threshold.interval",
      "no interval without decisive outcomes",
    );
  }
  if ("comparison" in report) comparisonSection(report.comparison, marketCounts);
  if ("ablation" in report) ablationSection(report.ablation, marketCounts);
  if ("evidence" in report) {
    requireValue(
      report.evidence === "development",
      "evaluation.evidence",
      "historical scores are development evidence",
    );
  }
  return true;
}

function comparisonSection(value: unknown, marketCounts: ReadonlyMap<string, number>): void {
  const comparison = record(value, "evaluation.comparison");
  hash(comparison.previousChecksum, "evaluation.comparison.previousChecksum");
  requireValue(
    comparison.evidence === "development",
    "evaluation.comparison.evidence",
    "a historical comparison is development evidence and cannot release a market",
  );
  const seen = new Set<string>();
  for (const entry of array(comparison.markets, "evaluation.comparison.markets")) {
    const market = record(entry, "evaluation.comparison.market");
    const name = text(market.market, "evaluation.comparison.market.market");
    const expected = marketCounts.get(name);
    requireValue(expected !== undefined, "evaluation.comparison.market", "unsupported market");
    requireValue(!seen.has(name), "evaluation.comparison.markets", "duplicate market");
    seen.add(name);
    requireValue(
      count(market.count, "evaluation.comparison.market.count", 1) === expected,
      "evaluation.comparison.market.count",
      "a comparison must cover the same games as the report",
    );
    scores(market.candidate, "evaluation.comparison.candidate");
    scores(market.previous, "evaluation.comparison.previous");
    interval(market.logLossDifferenceInterval, "evaluation.comparison.interval");
  }
}

function ablationSection(value: unknown, marketCounts: ReadonlyMap<string, number>): void {
  const seen = new Set<string>();
  for (const entry of array(value, "evaluation.ablation")) {
    const group = record(entry, "evaluation.ablation.group");
    const name = text(group.group, "evaluation.ablation.group.group");
    requireValue(
      name.length > 0 && !seen.has(name),
      "evaluation.ablation",
      "duplicate input group",
    );
    seen.add(name);
    const features = array(group.features, "evaluation.ablation.features");
    requireValue(
      features.length > 0,
      "evaluation.ablation.features",
      "an input group names its features",
    );
    for (const feature of features) text(feature, "evaluation.ablation.feature");
    const markets = new Set<string>();
    for (const item of array(group.markets, "evaluation.ablation.markets")) {
      const market = record(item, "evaluation.ablation.market");
      const marketName = text(market.market, "evaluation.ablation.market.market");
      const expected = marketCounts.get(marketName);
      requireValue(
        expected !== undefined && !markets.has(marketName),
        "evaluation.ablation.market",
        "unsupported or duplicate market",
      );
      markets.add(marketName);
      requireValue(
        count(market.count, "evaluation.ablation.market.count", 1) === expected,
        "evaluation.ablation.market.count",
        "an ablation must cover the same games as the report",
      );
      scores(market.withGroup, "evaluation.ablation.withGroup");
      scores(market.withoutGroup, "evaluation.ablation.withoutGroup");
      interval(market.logLossDifferenceInterval, "evaluation.ablation.interval");
    }
  }
}

/** Parses a versioned report tied to this exact artifact before release. */
export function parseEvaluationReport(input: {
  value: unknown;
  artifact: ModelArtifact;
}): EvaluationReport {
  if (!isEvaluationReport(input.value, input.artifact))
    throw new Error("Invalid evaluation report");
  return input.value;
}
