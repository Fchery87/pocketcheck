# Baseline model evaluation

This note records how the baseline is fit and how it scores on real NFL games. It is not a claim that the model is profitable. On every market it still scores worse than the no-vig closing price.

## What is fit

- **Data.** `data/sources/games.csv` is the nflverse schedule (`npm run data:schedule`). `pricedGamesFromNflverseCsv` keeps finished games and their recorded closing moneyline, spread, and total. `location == "Neutral"` sets the home indicator to 0. Prices that are not recorded stay missing.
- **Features** use only games whose kickoff is strictly earlier. Team form is recency-weighted:
  - Each later game multiplies earlier weights by `gameDecay` (0.94).
  - A new season multiplies them by `seasonCarry` (0.5).
  - Every team starts with `priorWeight` (2) games of league-average form: a margin of 0, and the mean points of strictly earlier games.
  - Rest days count only within a season, so a season opener has 7 days of rest, not the whole offseason.
  - The artifact records these parameters as `featureParameters`.
- **Means.** Separate ridge regressions predict home margin and total points. Ridge is 1. Features are centered and scaled on the training window only.
- **Residuals** are walk-forward (`residualSource: "walk-forward"`). The training window is split into 5 chronological blocks, and each block after the first is scored by a model fit only on the blocks before it. Training windows under 40 games fall back to in-sample residuals and say so.
- **Distribution.** Probabilities come from a Gaussian-smoothed residual distribution over integer point bins (bandwidth 1.5). Moneyline and spread share the margin bins. Totals use their own bins. A predicted mean is not a cover probability.
- **Key numbers and ties.** Each integer margin is multiplied by `keyNumberWeights`: how often the training games ended on that margin, divided by a smooth curve through the margin histogram (bandwidth 3). Margins are pooled by absolute value and shrunk toward 1 with a pseudo-count of 5. Totals are not reweighted. Weights learned from 1999–2021 include 3 → 2.58, 7 → 1.77, 10 → 1.45, 14 → 1.70, and a tie → 0.10.
- `releaseStatus` defaults to `unreleased`. `valueEligibility` refuses a value recommendation until a later policy releases an experimental artifact.

## Commands

```bash
npm run model:fit -- data/sources/games.csv data/artifacts/baseline.json 2022-03-01T00:00:00Z
npm run model:evaluate -- data/artifacts/baseline.json data/sources/games.csv data/artifacts/baseline-evaluation.json
```

The fit command also accepts the synthetic JSON fixture in `tests/model/fixtures/`. Without a cutoff, the earliest 70% of games train. The artifact (version 2) stores the dataset hash, feature definitions and parameters, training cutoff, fit parameters, base rates, residual source, residual support, key weights, and a checksum of those fields. Artifacts stay under `data/artifacts/`, which is gitignored. Evaluating on the full history takes about a minute.

## Baselines

The constant 57/40/3 home-field guess has been removed. Each baseline is scored on the same forecasts as the model:

- `training-base-rate` (moneyline): home win, loss, and tie rates in the training window.
- `market-no-vig` (moneyline, spread, total): the closing price for the same side with the vig removed proportionally. It borrows the model's push probability, so the comparison measures direction rather than push handling.

## Results on real games

The model was fit on 1999 through the 2021 season and scored on 1,241 games from 2022 onward. Lower is better. Each row adds one change to the row above it.

| Change                                       | Moneyline Brier | Moneyline log loss | Spread Brier | Total Brier |
| -------------------------------------------- | --------------- | ------------------ | ------------ | ----------- |
| Before P2 (plain means, in-sample residuals) | 0.4937          | 0.7221             | 0.5692       | 0.5426      |
| Season-aware, recency-weighted features      | 0.4516          | 0.6754             | 0.5447       | 0.5246      |
| Walk-forward residuals                       | 0.4511          | 0.6753             | 0.5445       | 0.5250      |
| Key-number and tie weights                   | 0.4501          | 0.6566             | 0.5408       | 0.5250      |
| Training base rate                           | 0.4990          | 0.7086             | n/a          | n/a         |
| No-vig closing market                        | 0.4282          | 0.6321             | 0.5238       | 0.5079      |

The feature parameters were chosen by validation RMSE: fit through 2016 and score 2017–2021, without touching the 2022+ holdout. Validation margin RMSE went from 14.30 with plain all-history means to 13.52.

Walk-forward residuals barely changed the scores. With 9 features and about 5,900 training games, in-sample overfitting was small. The change removes a bias that would grow with more features.

Push and tie calibration on the holdout:

| Outcome                         | Predicted | Observed            |
| ------------------------------- | --------- | ------------------- |
| Tie                             | 0.30%     | 0.32% (1,241 games) |
| Push on any integer spread line | 5.03%     | 6.72% (521 games)   |
| Push on a line of 3             | 8.06%     | 12.50% (184 games)  |

## Limits

- The no-vig closing market beats the model on every market. Treat any single-game difference from the market as noise unless a later model closes that gap.
- Pushes on key-number lines are still under-predicted. The key weights are unconditional. They do not yet sharpen with the predicted mean or the line itself.
- nflverse closing prices come from one archived source per game, not a consensus or a timestamped close.
- Opponent strength is still only recency-weighted margin and points. There are no quarterback, injury, or weather features.
