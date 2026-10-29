# Baseline model evaluation

The historical scores in this note are superseded development evidence. They were produced before the concurrent-game feature and fold leakage corrections. The 2022+ holdout has also been inspected repeatedly during model selection, so it is not independent validation. None of these results establishes a betting advantage. Refit and reevaluate artifacts before using corrected chronological results; no new performance claim accompanies this correction.

## What is fit

- **Data.** `data/sources/games.csv` is the nflverse schedule (`npm run data:schedule`). `pricedGamesFromNflverseCsv` keeps finished games and their recorded closing moneyline, spread, and total. `location == "Neutral"` sets the home indicator to 0. Prices that are not recorded stay missing.
- **Chronology.** A result is eligible only when its availability is strictly earlier than the decision cutoff. An explicit `resultAvailableAt` retains source-established availability. When absent, the pipeline uses kickoff plus 24 hours as a conservative policy estimate, not a source publication timestamp or proof that a delayed game finished. Sources that establish a later result must supply that later timestamp. All rows in one kickoff group are generated before its outcomes can enter history. Earlier-started games that overlap the cutoff stay excluded. New artifacts record this rule in `chronology` with version `result-availability-v1`.
- **Features** use only eligible results. Team form is recency-weighted:
  - Each later game multiplies earlier weights by `gameDecay` (0.94).
  - A new season multiplies them by `seasonCarry` (0.5).
  - Every team starts with `priorWeight` (2) games of league-average form: a margin of 0, and the mean points of eligible games.
  - Rest days count only within a season, so a season opener has 7 days of rest, not the whole offseason.
  - `home_qb_share` and `away_qb_share` are the share of the team's last 8 games started by this game's starting quarterback (nflverse `home_qb_id` and `away_qb_id`). When the starter is not known yet, as for most upcoming games, the feature assumes the team's most frequent recent starter. Before a team's first game it is 1.
  - `home_qb_rating` and `away_qb_rating` are the recency-weighted team margin in every strictly earlier game the starter started, for any team. The rating decays by `qbDecay` (0.97) per start and starts with `qbPriorWeight` (4) starts at `qbReplacement` (-3 points), so a quarterback with no starts is rated slightly below average. Unknown starters follow the same rule as the share.
  - The artifact records these parameters as `featureParameters`.
- **Means.** Separate ridge regressions predict home margin and total points. Ridge is 1. Features are centered and scaled on the training window only.
- **Fitting and residuals.** Final fitting includes only outcomes available strictly before the training cutoff. Walk-forward evaluation divides distinct kickoff groups into at most 5 chronological blocks. Each block fits only earlier outcomes available before its first kickoff. Residual distributions, key weights, and calibration also exclude outcomes unavailable at that block cutoff. Blocks without eligible fitting history produce no predictions. Blocks without eligible earlier residuals produce no calibration. Training windows under 40 games, or without any walk-forward predictions, fall back to in-sample residuals and explicitly record `residualSource: "in-sample"`.
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

The fit command also accepts the synthetic JSON fixture in `tests/model/fixtures/`. Without a cutoff, the kickoff at the 70% boundary supplies the decision cutoff, and only outcomes available before it train. The artifact (version 4) stores the dataset hash, feature definitions and parameters, training cutoff, fit parameters, base rates, residual source, residual support, key weights, a walk-forward calibration table, and a checksum of those fields. Artifacts stay under `data/artifacts/`, which is gitignored. Evaluating on the full history takes about 10 seconds.

## External input contracts

Artifact loading, `model:evaluate`, and `model:release` parse artifact JSON as unknown input. Supported artifacts have kind `pocketcheck-baseline` and version 4. The required `chronology` record must match `result-availability-v1`, the kickoff-plus-24-hours fallback, the strictly-before cutoff, and intact kickoff groups. Artifacts without this record must be refit. They require the complete feature definitions, finite model coefficients and means, positive feature scales, valid residual support and bandwidth, normalized base-rate probabilities, and a complete calibration table for moneyline, spread, and total. Release status must agree with the unique supported released markets. The SHA-256 checksum must match the validated contents. A matching checksum alone does not establish a valid artifact.

Evaluation reports use version 1. Their required identity fields are `artifactChecksum`, `datasetHash`, `trainingCutoff`, and `holdoutGames`. The checksum, dataset, and training cutoff must match the artifact being released. Older unversioned reports must be regenerated with `npm run model:evaluate`.

Every report requires its overall scores, calibration, market summaries, price coverage, baseline comparisons, and threshold records for all three markets. Scores must be finite and nonnegative. Counts must be nonnegative safe integers and agree across the holdout, market, calibration, coverage, and threshold records. Baseline counts cannot exceed their market samples. Duplicate baseline identities are invalid. Probabilities and interval endpoints must be valid and ordered. Required numeric fields cannot be missing or null. Zero scores and counts remain valid. Nullable uncertainty intervals and rates remain null only where the contract represents unavailable evidence.

Invalid artifacts produce an unavailable-model reason in research runs and supply no model probabilities to the policy or browser. The artifact's training cutoff must precede the game and cannot follow the research decision cutoff. Invalid release inputs exit with code 1 and an explanation before writing output, preserving any existing output file. Valid reports still need to pass the release gate. A versioned historical report does not satisfy the independent prospective protocol required by the current project specification.

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

## Market-anchored forecasting model

Version 5 starts every forecast from the anchor line and fits only the deviation from it. The anchor is one sportsbook's two sides: the no-vig home win probability mapped to an implied margin for a moneyline, the home line for a spread, and the total line for a total. History anchors on the recorded close. A row without a close is counted in `anchor.excludedNoClose` and left out. A board market without a two-sided quote has no forecast.

The added input groups are quarterback efficiency, opponent-adjusted team efficiency, pace, and rest situation. A group is kept only when dropping it makes held-out log loss worse. The ablation is in the evaluation report. Close-anchored scores are development evidence. They use the closing line, which already contains late news, so they overstate a decision-time forecast and cannot release a market.

`npm run model:refit` writes a new unreleased artifact beside the one in use. It replaces the artifact in use only with `--replace`. A version 4 artifact is refused with a refit-required reason.

The version 4 numbers above predate the market anchor. The version 6 real-data run follows; its figures are development evidence only and make no accuracy claim.

## Version 6 ablation on real data

Run on the nflverse schedule and play-by-play for 2016-2025, trained through 2022-09-01 and scored on 1245 priced games from 2022 on (`MODEL_SINCE_SEASON=2016 npm run model:fit` and `model:evaluate`). This is development evidence: the close is the anchor and already holds late news. The holdout was inspected to choose groups, so it cannot release a market.

Each cell is held-out log loss without the group minus with it, so positive means the group helps. `*` marks a 90% slate-clustered interval that excludes zero in the helpful direction, and `(harms)` one that excludes zero the other way.

| Group                     | Moneyline       | Spread          | Total           | Decision         |
| ------------------------- | --------------- | --------------- | --------------- | ---------------- |
| score margin              | +0.0141 *       | -0.0005         | -0.0005         | kept             |
| points scored and allowed | +0.0246 *       | +0.0082         | -0.0014         | kept             |
| rest                      | +0.0004         | +0.0000         | +0.0028 *       | kept (total)     |
| quarterback               | +0.0314 *       | +0.0029         | +0.0008         | kept             |
| home field                | -0.0001         | +0.0001         | +0.0006         | kept             |
| quarterback efficiency    | +0.0025         | -0.0028         | -0.0001         | dropped          |
| team efficiency           | +0.0302 *       | +0.0728 *       | +0.0220 *       | kept             |
| pace                      | -0.0017 (harms) | -0.0024 (harms) | -0.0002         | dropped          |
| situational               | +0.0014         | +0.0022         | -0.0026 (harms) | dropped          |
| efficiency split          | +0.0340 *       | +0.0073         | -0.0024         | kept (moneyline) |
| efficiency quality        | +0.0220 *       | +0.0054         | -0.0042         | kept (moneyline) |
| turnover margin           | +0.0004         | -0.0001         | -0.0006         | dropped          |
| travel                    | -0.0024         | -0.0055 (harms) | +0.0095 *       | dropped          |
| venue                     | -0.0002         | -0.0005         | +0.0045         | dropped          |

A group stays only with a clear gain in some market and no clear harm in another. Fitting without the six dropped groups (`excludedGroups` in the artifact's feature parameters, so every artifact records it) improved every market on the same holdout:

| Market             | All groups | Kept groups only | No-vig close |
| ------------------ | ---------- | ---------------- | ------------ |
| Moneyline log loss | 0.7427     | 0.7415           | 0.6557       |
| Spread log loss    | 0.8709     | 0.8676           | 0.7832       |
| Total log loss     | 0.7408     | 0.7310           | 0.7251       |

The forecasting model still loses to the no-vig close in all three markets, so the release gate is unchanged and no market is released.

Notes on each decision:

- **Quarterback efficiency** (EPA per dropback plus completion over expected, shrunk toward replacement) dropped: a small moneyline gain whose interval spans zero and a spread loss.
- **Team efficiency** is the strongest input. The pass and rush split and the success, early-down, and explosive rates add to moneyline only.
- **Turnover margin** (regressed toward zero) dropped. Excluding fumble recoveries from the EPA means, the other option in the ticket, was not built, so only the regression variant was tested.
- **Travel and venue** (distance, time zones, altitude, international, roof, surface) dropped. Travel helps the total but harms the spread; venue shows nothing. Rest differential, short week, and bye (`situational`) also dropped. Rest days remain, helping the total.
- **Pace** dropped. Tempo is now measured as the game clock between snaps of one drive; before, it averaged seconds remaining and meant nothing.
- Quarterback ratings, opponent adjustment, `seasonCarry`, `opponentAdjustment`, `qbCpoeScale`, and `turnoverRegression` are versioned in `featureParameters`. None was tuned on this holdout.

## Release gate

`releaseDecision` (`src/lib/server/models/release.ts`) compares each market with the `market-no-vig` baseline on the artifact's historical holdout. A clean comparison still needs:

- At least 500 priced holdout games.
- Log loss no worse than the market's.
- Brier no worse than the market's.

Beating the training base rate does not count. A clean comparison is **development evidence**. The 2022+ holdout was inspected during model selection, so it is not an independent protocol and `releaseDecision` never sets `released: true`.

`npm run model:evaluate` prints each market's development decision and reason. `npm run model:release` reads that report only as development context. It does not write a released artifact from the holdout. Missing independent prospective results exit with code 1 and leave the output unwritten.

## Prospective protocol

The independent protocol is `prospective-2026-10-26`. It was frozen on 2026-10-26, before its outcomes exist to inspect. Its identity covers:

- The artifact checksum being evaluated.
- Input availability `decision-time-starters-v1`.
- Markets moneyline, spread, and total.
- An open evaluation period starting 2026-10-26.
- At least 500 priced games per market.
- The existing slate-clustered 90% interval for log loss minus the closing comparison.
- Release only when Brier and log loss are no worse than that close and the interval's upper endpoint is at most zero.

Changing any of those rules requires a new protocol id. The protocol scores forecasts saved at decision time. It does not rebuild them from the current artifact, schedule, starter identities, or final score. A timestamped executable offer stays distinct from the closing comparison. A missing close is a missing observation, not a zero. Release eligibility is not a profitability claim.

No market in this repository has completed that sample. An unreleased artifact stays unreleased. Application model status names `prospective-2026-10-26` and the blocking reason. The deterministic policy is unchanged: only a released market can be eligible, and the label remains experimental.

A controlled record can show the gate opening and closing. That demonstration is not a claim that a PocketCheck market has earned release.

## Uncertainty

The artifact records a walk-forward calibration table per market (`uncertainty`, method `walk-forward-calibration`). It is built only from forecasts inside the training window. Each block is predicted by a model and a residual distribution fit on earlier blocks, and the holdout is never inspected. Forecasts are grouped into 20 bins of decisive win probability, each 0.05 wide.

Each bin stores its sides, its NFL slates, the mean predicted probability, the observed rate, and a conservative rate. The conservative rate is the lower end of a 90% interval from a slate-clustered bootstrap: 1,000 resamples, seed `20261025`, with every game in one NFL week (Tuesday through Monday, Eastern time) resampled together. A bin with fewer than 60 sides, or fewer than 2 slates, has no conservative rate.

On the 1999–2021 window the populated bins and decisive sides were:

| Market    | Populated bins | Decisive sides | Bins with a conservative rate |
| --------- | -------------- | -------------- | ----------------------------- |
| Moneyline | 18             | 7,034          | 16                            |
| Spread    | 16             | 6,836          | 8                             |
| Total     | 14             | 6,928          | 8                             |

The two moneyline bins under 0.10 and over 0.90 have 13 sides each, so their uncertainty cannot be assessed. Across the usable bins the conservative rate sits below the observed rate. The middle moneyline bin (0.45–0.50) predicted 0.475, observed 0.477, and its conservative rate is 0.448.

At run time the offer's decisive win probability `q` becomes `min(q, conservativeRate + (q − meanPredicted))`, which never exceeds the model's own estimate. When the bin cannot be assessed, the run says so instead of guessing.

## Value threshold

`VALUE_THRESHOLD` in `src/lib/domain/threshold.ts` is `{ version: "threshold-2026-10-25", conservativeExpectedValue: 0 }`. It was frozen before this holdout was examined. Evaluation reports how it would have behaved and never tunes it. The report uses closing prices as a stand-in for the offer, and the spec forbids treating closing prices as executable, so the counts below are descriptive.

For a released market the policy (`policy-2026-10-25.2`) now works in this order:

- No positive expected value at the recorded price: pass.
- Uncertainty cannot be assessed: insufficient evidence.
- The point estimate is positive but the conservative expected value is not above 0: experimental lean.
- Otherwise: experimental value candidate.

On the 2022+ holdout, using closing prices:

| Market    | Assessed | Would clear 0 | Decisive | Wins | Observed rate | Mean break-even | 90% interval   |
| --------- | -------- | ------------- | -------- | ---- | ------------- | --------------- | -------------- |
| Moneyline | 1,242    | 257           | 255      | 112  | 0.439         | 0.473           | 0.395 to 0.485 |
| Spread    | 1,221    | 39            | 37       | 18   | 0.486         | 0.511           | 0.343 to 0.628 |
| Total     | 1,235    | 7             | 7        | 3    | 0.429         | 0.501           | 0.143 to 0.714 |

Every observed rate is below its mean break-even, and every interval includes values below it. The threshold would not have found a profitable set.

Each baseline comparison also carries a slate-clustered 90% interval for the model's log loss minus the baseline's. Against the no-vig market the intervals are moneyline 0.010 to 0.025, spread 0.008 to 0.023, and total 0.008 to 0.022. Each excludes 0, so the model's loss to the market is larger than slate noise. The interval against the training base rate is entirely negative, which only says the model beats a constant.

## In research runs

Each run asks the configured artifact (`POCKETCHECK_MODEL_ARTIFACT`, default `data/artifacts/baseline.json`, or `off`) for the recorded offer's win, loss, and push:

- **Features.** The game's row uses only results available strictly before the run's decision cutoff under the chronology rule above, using any starting quarterbacks the schedule already lists. Archived starters still lack decision-time provenance and do not establish equivalent live inputs.
- **Pricing.** Moneyline ties follow the offer's tie rule: push, void, loss, or win. A spread line belongs to the selected side.
- **Refusals.** The run records "unavailable" and the reason when the artifact is missing, fails its checksum, is an older version, or was trained on games through this one.
- **Freezing.** The run saves the artifact's checksum, version, training cutoff, release state, the probabilities, and whether the offer's market is eligible. This is the `probability_model` column on `analyses`, added in migration 006, and it is kept through export and restore. A captured analysis also stores a prospective forecast record on the analysis snapshot: versioned feature values, the `decision-time-starters-v1` availability rule, the decision cutoff, the artifact checksum and version, starter states (`known`, `assumed`, or `unknown`) with evidence times, market eligibility, probabilities, uncertainty, and policy identity. Archived actual starters without decision-time evidence stay unknown. Later edits to the schedule, artifact, starters, final score, or current policy do not replace that record. A null forecast means input provenance was not captured. Those legacy rows are not original prospective forecasts and are not regenerated as if they were.
- **Eligibility.** Only an eligible model's probabilities reach the value policy. Otherwise the policy's blocking reason is the model's own reason.
- **Report.** The report names the artifact and the reason. An ineligible model's probabilities are left out of the page data entirely, so they never reach the browser.

## Limits

- The no-vig closing market beats the model on every market. Treat any single-game difference from the market as noise unless a later model closes that gap.
- Pushes on lines of 3 are still under-predicted, because the model's mean is less sharp than the market's (see above).
- nflverse closing prices come from one archived source per game, not a consensus or a timestamped close.
- Opponent strength is recency-weighted margin and points plus quarterback share and rating, with efficiency, pace, and situational features added in version 5.
- Weather is recorded on a frozen forecast from the kickoff snapshot already collected. A dome or closed roof ignores it, and a missing outdoor forecast is a gap, not zero wind. No points are applied. Past forecasts were never saved, so there is nothing to fit, and the handbook research refuses a number for wind until a fit supports one. The recorded version is `weather-unfitted-v1`.
- Injury impact weights a player listed out or doubtful by recent snap share times a versioned position value (`position-values-v1`). The quarterback is excluded, because the starter state handles that position. A player with no snap share is counted as unknown, not healthy, and a designation with no publication time is ignored. nflverse injury rows have no publication time, so they cannot be shown to predate the cutoff and do not reach a forecast. The group is not in the fitted model. It stays out until designations carry a publication time and the ablation shows a gain.
- Most upcoming games list no starter, so the features assume each team's usual starter. A starter ruled out on the injury report is not yet reflected. A frozen forecast records that assumption only when decision-time evidence says the starter was known or assumed. An archived `home_qb_id` or `away_qb_id` without that evidence does not become a known live input.
- Saving a prospective forecast does not establish independent performance. The record is what a later protocol can read. It is not a released market, and it does not satisfy the 500-game or interval release criteria.
- A market becomes an experimental value candidate only when its conservative expected value clears the frozen threshold above. No market is released, so no run reaches that conclusion today.
