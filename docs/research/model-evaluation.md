# Baseline model evaluation

This note records how the baseline is fit and how it scores on real NFL games. It is not a claim that the model is profitable. On every market it still scores worse than the no-vig closing price.

## What is fit

- **Data.** `data/sources/games.csv` is the nflverse schedule (`npm run data:schedule`). `pricedGamesFromNflverseCsv` keeps finished games and their recorded closing moneyline, spread, and total. `location == "Neutral"` sets the home indicator to 0. Prices that are not recorded stay missing.
- **Features** use only games whose kickoff is strictly earlier. Team form is recency-weighted:
  - Each later game multiplies earlier weights by `gameDecay` (0.94).
  - A new season multiplies them by `seasonCarry` (0.5).
  - Every team starts with `priorWeight` (2) games of league-average form: a margin of 0, and the mean points of strictly earlier games.
  - Rest days count only within a season, so a season opener has 7 days of rest, not the whole offseason.
  - `home_qb_share` and `away_qb_share` are the share of the team's last 8 games started by this game's starting quarterback (nflverse `home_qb_id` and `away_qb_id`). When the starter is not known yet, as for most upcoming games, the feature assumes the team's most frequent recent starter. Before a team's first game it is 1.
  - `home_qb_rating` and `away_qb_rating` are the recency-weighted team margin in every strictly earlier game the starter started, for any team. The rating decays by `qbDecay` (0.97) per start and starts with `qbPriorWeight` (4) starts at `qbReplacement` (-3 points), so a quarterback with no starts is rated slightly below average. Unknown starters follow the same rule as the share.
  - The artifact records these parameters as `featureParameters`.
- **Means.** Separate ridge regressions predict home margin and total points. Ridge is 1. Features are centered and scaled on the training window only.
- **Residuals** are walk-forward (`residualSource: "walk-forward"`). The training window is split into 5 chronological blocks, and each block after the first is scored by a model fit only on the blocks before it. Training windows under 40 games fall back to in-sample residuals and say so.
- **Distribution.** Probabilities come from a Gaussian-smoothed residual distribution over integer point bins (bandwidth 1.5). Moneyline and spread share the margin bins. Totals use their own bins. A predicted mean is not a cover probability.
- **Key numbers and ties.** Each integer margin is multiplied by `keyNumberWeights`: how often the training games ended on that margin, divided by a smooth curve through the margin histogram (bandwidth 3). Margins are pooled by absolute value and shrunk toward 1 with a pseudo-count of 5. Totals are not reweighted. Weights learned from 1999–2021 include 3 → 2.58, 7 → 1.77, 10 → 1.45, 14 → 1.70, and a tie → 0.10.
- **Outcome range.** Integer bins run from the predicted mean plus the lowest residual, less 14 points, to the mean plus the highest residual, plus 14. Before this fix the range ignored the mean, so totals were cut off at 81 points and 9 holdout games ended on totals given zero probability. The residual density is sampled once on a 0.05-point grid, which takes scoring the full history from about a minute to about 7 seconds.
- **Release.** `releaseStatus` defaults to `unreleased` with no `releasedMarkets`. See the release gate below.

## Commands

```bash
npm run model:fit -- data/sources/games.csv data/artifacts/baseline.json 2022-03-01T00:00:00Z
npm run model:evaluate -- data/artifacts/baseline.json data/sources/games.csv data/artifacts/baseline-evaluation.json
npm run model:release -- data/artifacts/baseline.json data/artifacts/baseline-evaluation.json data/artifacts/baseline-released.json
```

The fit command also accepts the synthetic JSON fixture in `tests/model/fixtures/`. Without a cutoff, the earliest 70% of games train. The artifact (version 3) stores the dataset hash, feature definitions and parameters, training cutoff, fit parameters, base rates, residual source, residual support, key weights, and a checksum of those fields. Artifacts stay under `data/artifacts/`, which is gitignored. Evaluating on the full history takes about a minute.

## Baselines

The constant 57/40/3 home-field guess has been removed. Each baseline is scored on the same forecasts as the model:

- `training-base-rate` (moneyline): home win, loss, and tie rates in the training window.
- `market-no-vig` (moneyline, spread, total): the closing price for the same side with the vig removed proportionally. It borrows the model's push probability, so the comparison measures direction rather than push handling.

## Results on real games

The model was fit on 1999 through the 2021 season and scored on games from 2022 onward. Lower is better. Each row adds one change to the row above it. The last two model rows were scored after a schedule refresh added three finished games (1,244 instead of 1,241), so compare them with each other.

| Change                                       | Moneyline Brier | Moneyline log loss | Spread Brier | Total Brier |
| -------------------------------------------- | --------------- | ------------------ | ------------ | ----------- |
| Before P2 (plain means, in-sample residuals) | 0.4937          | 0.7221             | 0.5692       | 0.5426      |
| Season-aware, recency-weighted features      | 0.4516          | 0.6754             | 0.5447       | 0.5246      |
| Walk-forward residuals                       | 0.4511          | 0.6753             | 0.5445       | 0.5250      |
| Key-number and tie weights                   | 0.4501          | 0.6566             | 0.5408       | 0.5250      |
| Starting-quarterback share                   | 0.4468          | 0.6529             | 0.5403       | 0.5230      |
| Quarterback share, 1,244 games               | 0.4463          | 0.6523             | 0.5402       | 0.5228      |
| Per-quarterback rating, 1,244 games          | 0.4432          | 0.6490             | 0.5388       | 0.5222      |
| Training base rate, 1,244 games              | 0.4991          | 0.7087             | n/a          | n/a         |
| No-vig closing market, 1,244 games           | 0.4278          | 0.6314             | 0.5237       | 0.5079      |

The feature parameters were chosen by validation RMSE: fit through 2016 and score 2017–2021, without touching the 2022+ holdout. Validation margin RMSE went from 14.30 with plain all-history means to 13.52.

Walk-forward residuals barely changed the scores. With 9 features and about 5,900 training games, in-sample overfitting was small. The change removes a bias that would grow with more features.

The quarterback share lowered validation margin RMSE from 13.53 to 13.44, and the per-quarterback rating lowered it again to 13.37. The rating's parameters were chosen on the same validation window. Its gain held across every setting tried (decay 0.90–0.97, prior 4–16 starts, replacement -6 to 0).

Push and tie calibration on the holdout, before the quarterback feature:

| Outcome                         | Predicted | Observed            |
| ------------------------------- | --------- | ------------------- |
| Tie                             | 0.30%     | 0.32% (1,241 games) |
| Push on any integer spread line | 5.03%     | 6.72% (521 games)   |
| Push on a line of 3             | 8.06%     | 12.50% (184 games)  |

### Why pushes on a line of 3 stay low

Two variants were tried and reverted because both scored worse on the holdout than the weights above:

- Key weights estimated separately for 4 bands of the model's predicted margin.
- Weights measured against the model's own smooth predictions instead of a smoothed histogram.

| Variant                     | Moneyline Brier | Moneyline log loss | Spread Brier |
| --------------------------- | --------------- | ------------------ | ------------ |
| Histogram weights (kept)    | 0.4501          | 0.6566             | 0.5408       |
| 4 bands by predicted margin | 0.4511          | 0.6607             | 0.5435       |
| Model-calibrated, 1 band    | 0.4511          | 0.6577             | 0.5433       |

The learned weight at 3 was about the same in every band (2.4 to 2.9). Within the model's own bands, its probability of a field-goal margin is close to what happens:

| Games                  | Predicted | Observed          |
| ---------------------- | --------- | ----------------- |
| Model `\|mean\|` < 4.5 | 8.4%      | 10.2% (707 games) |
| Model `\|mean\|` ≥ 4.5 | 7.8%      | 6.2% (534 games)  |
| Closing line of 3      | 8.0%      | 12.5% (184 games) |

The gap is in games the market lined at 3. The market knows those games are close, and the model's mean is less sharp. Closing it means a better mean, not different key weights. Using the offered line as an input would make a comparison against that same line circular.

## Release gate

`releaseDecision` (`src/lib/server/models/release.ts`) checks each market against the `market-no-vig` comparison on the artifact's holdout. A market passes only when all of these hold:

- At least 500 priced holdout games.
- Log loss no worse than the market's.
- Brier no worse than the market's.

Beating the training base rate does not count, because the model does that while still losing to the price it would bet against.

`npm run model:evaluate` prints each market's decision and reason. `npm run model:release` accepts only an evaluation of that exact artifact (matching checksum). It writes a new artifact with `releaseStatus: "released-experimental"`, the passing `releasedMarkets`, and a fresh checksum, and leaves the input unchanged. When no market passes, it exits with the reasons and writes nothing. `valueEligibility(artifact, market)` is true only for a released artifact and a released market.

On the numbers above, no market passes.

## In research runs

Each run asks the configured artifact (`POCKETCHECK_MODEL_ARTIFACT`, default `data/artifacts/baseline.json`, or `off`) for the recorded offer's win, loss, and push:

- **Features.** The game's row is built only from finished games that kicked off before the run's decision cutoff, using any starting quarterbacks the schedule already lists.
- **Pricing.** Moneyline ties follow the offer's tie rule: push, void, loss, or win. A spread line belongs to the selected side.
- **Refusals.** The run records "unavailable" and the reason when the artifact is missing, fails its checksum, is an older version, or was trained on games through this one.
- **Freezing.** The run saves the artifact's checksum, version, training cutoff, release state, the probabilities, and whether the offer's market is eligible. This is the `probability_model` column on `analyses`, added in migration 006, and it is kept through export and restore.
- **Eligibility.** Only an eligible model's probabilities reach the value policy. Otherwise the policy's blocking reason is the model's own reason.
- **Report.** The report names the artifact and the reason. An ineligible model's probabilities are left out of the page data entirely, so they never reach the browser.

## Limits

- The no-vig closing market beats the model on every market. Treat any single-game difference from the market as noise unless a later model closes that gap.
- Pushes on lines of 3 are still under-predicted, because the model's mean is less sharp than the market's (see above).
- nflverse closing prices come from one archived source per game, not a consensus or a timestamped close.
- Opponent strength is recency-weighted margin and points plus quarterback share and rating. There are no other injury features and no weather.
- Most upcoming games list no starter, so the features assume each team's usual starter. A starter ruled out on the injury report is not yet reflected.
- For a released market, the policy calls any positive expected value an experimental value candidate. The spec also asks for an explicit uncertainty assessment before that conclusion. That is not built yet, and no market is released.
