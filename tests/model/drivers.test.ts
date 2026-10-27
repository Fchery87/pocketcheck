import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { parseArtifact } from "../../src/lib/server/models/inputs.ts";
import { FEATURE_DEFINITIONS, type FeatureRow } from "../../src/lib/server/models/features.ts";
import { predictGame } from "../../src/lib/server/models/predict.ts";

const artifact = parseArtifact(
  JSON.parse(readFileSync("tests/fixtures/models/browser-forecasting-model.json", "utf8")),
);

/** Every feature at its training mean, so only the overridden ones contribute. */
function rowAtMeans(overrides: Partial<FeatureRow["features"]>): FeatureRow {
  const features = Object.fromEntries(
    FEATURE_DEFINITIONS.map(({ name }) => [name, artifact.margin.model.featureMeans[name]]),
  ) as FeatureRow["features"];
  return {
    gameId: "driver-check",
    kickoff: "2026-10-25T17:00:00Z",
    features: { ...features, ...overrides },
  };
}

describe("forecast drivers", () => {
  it("returns each feature's signed point effect on the predicted margin", () => {
    const margin = artifact.margin.model;
    const row = rowAtMeans({
      away_rest_days: margin.featureMeans.away_rest_days + margin.featureScales.away_rest_days,
      home_prior_margin:
        margin.featureMeans.home_prior_margin + 2 * margin.featureScales.home_prior_margin,
    });
    const predicted = predictGame(artifact, row);
    const byName = Object.fromEntries(
      predicted.drivers.margin.contributions.map((item) => [item.feature, item.points]),
    );
    // Worked by hand from the artifact's coefficients: one and two standard deviations.
    expect(byName.away_rest_days).toBeCloseTo(-4.641235887593899, 9);
    expect(byName.home_prior_margin).toBeCloseTo(-6.697206315864221, 9);
    expect(byName.home_indicator).toBeCloseTo(0, 12);
    expect(predicted.drivers.margin.contributions.map((item) => item.feature)).toEqual(
      FEATURE_DEFINITIONS.map((item) => item.name),
    );
    expect(predicted.drivers.margin.intercept).toBeCloseTo(-0.25, 12);
    expect(predicted.marginMean).toBeCloseTo(-0.25 - 4.641235887593899 - 6.697206315864221, 9);
  });

  it("returns the total's own contributions, which sum with its intercept to the total mean", () => {
    const predicted = predictGame(
      artifact,
      rowAtMeans({ home_prior_points_for: 14.5, away_prior_points_for: 3 }),
    );
    const total = predicted.drivers.total;
    const sum = total.contributions.reduce((value, item) => value + item.points, total.intercept);
    expect(sum).toBeCloseTo(predicted.totalMean, 9);
    const home = total.contributions.find((item) => item.feature === "home_prior_points_for")!;
    expect(home.value).toBe(14.5);
    expect(home.points).not.toBe(0);
    // The margin model and the total model are fit separately, so their effects differ.
    const marginHome = predicted.drivers.margin.contributions.find(
      (item) => item.feature === "home_prior_points_for",
    )!;
    expect(marginHome.points).not.toBeCloseTo(home.points, 6);
  });
});
