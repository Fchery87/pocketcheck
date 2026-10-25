# Baseline model evaluation

This note records the synthetic chronological baseline. It is not a claim that the model is profitable or calibrated on real NFL games. Historical closing prices, injuries, and weather were not manufactured for this run.

## What was fit

- Features use only games whose kickoff is strictly earlier. Rest defaults to 7 days when a team has no prior game. Neutral games set the home indicator to 0.
- Separate ridge regressions predict home margin and total points. Ridge is 1. Features are centered and scaled on the training window only.
- Probabilities come from a Gaussian-smoothed residual distribution over integer point bins (bandwidth 1.5). Moneyline and spread share the margin bins. Totals use the total bins. Tie and push mass stays in the integer bin. A predicted mean is not a cover probability.
- `releaseStatus` defaults to `unreleased`. `valueEligibility` refuses a value recommendation until a later policy releases an experimental artifact.

## Commands

```bash
npm run model:fit -- tests/model/fixtures/synthetic-games.json data/artifacts/baseline.json
npm run model:evaluate -- data/artifacts/baseline.json tests/model/fixtures/synthetic-games.json data/artifacts/baseline-evaluation.json
```

The artifact stores the dataset hash, feature definitions, training cutoff, fit parameters, residual support, and a checksum of those fields. Artifacts stay under `data/artifacts/`, which is gitignored.

## What the synthetic evaluation shows

The fixture is eight invented games. Several rows omit moneyline, spread, or total prices. Those markets stay `missing` and are not scored as losses. The summary reports multiclass Brier and log loss, calibration bin counts, a constant home-field baseline, and coverage counts. On this toy sample the baseline comparison is descriptive only. No-vig market probabilities are omitted because the fixture prices are not a genuine historical odds archive.

Uncertainty is wide: the training window is tiny, residuals are in-sample, and opponent strength is only a raw prior margin. Do not treat a lower Brier than the constant baseline on these games as evidence of an edge.
