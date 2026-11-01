# Corrected input and discrete-anchor experiment

Date: 2026-11-01. This is development evidence, not a release evaluation.

## Declared sample

`scrimmage-v2` includes pass/run rows with a named offense, excluding `no_play`, quarterback kneels and spikes. Sacks and scrambles are dropbacks and count as passes when nflverse marks them as such. No garbage-time or era filter was introduced. Offensive/defensive play counts include eligible plays. EPA and success denominators use eligible rows with finite EPA. Explosive rate uses eligible rows with finite yards. PROE averages every available `pass_oe` on eligible plays, including runs, independently of EPA availability. Tempo uses eligible same-drive snaps with usable clocks and identifiers and retains the existing 50-second gap ceiling. Quarterback summaries use the same eligible sample.

The on-disk aggregate cache is version 2. A version 1 cache is rebuilt even when source size and modification time are unchanged. Margin and total ablations use their own fitted feature means. These changes and `probability-matched-discrete-v1` require `training-2026-11-01` and a new predictor format. Decision-time input availability chronology and frozen protocol remain unchanged.

## Correctness experiments

Red regressions reproduced six counted plays instead of three and PROE 40 instead of -10 when special teams, kneels and spikes accompanied mixed pass/run values. A separate red ablation regression produced a total contribution of -150 rather than zero when model means differed. Shaded spread and total anchors initially differed from their own decisive book probability by roughly 0.2342 and 0.1989 in the asymmetric synthetic case.

The revised mapping solves against final weighted integer mass. Coverage includes integer and half-point lines, asymmetric residuals, positive key weights, bounded infeasibility, and tie-rule application. The declared probability tolerance is 1e-8. A zero fitted adjustment must remove coefficients as well as the intercept, not merely set the intercept to zero.

## Read-only chronological development diagnostic

Command:

```sh
node --experimental-strip-types scripts/model/anchor-development-diagnostic.ts
```

The executable local inputs were `data/sources/games.csv` and unchanged `data/artifacts/baseline.json`, checksum `68f341bc8a02882c55f27ad99aa1a8eb1b70cdfb225b13452ee9485b262f6324`. The script bypasses live artifact loading only to inspect that historical distribution. It never fits, writes, registers or activates an artifact. It compares zero-adjustment total forecasts with the old line-as-mean mapping against the probability-matched mapping using the same old residuals. This is not a comparison of corrected fitted predictors.

The chronological sample contains 860 priced completed totals strictly after the artifact training cutoff `2023-10-22T20:05:00.000Z`, from `2023-10-22T20:25:00.000Z` through `2026-10-27T00:15:00.000Z`. All such local schedule rows are included, without tuning on their outcomes or asserting prospective qualification.

| Zero-adjustment mapping |   Multiclass Brier | Multiclass log loss |
| ----------------------- | -----------------: | ------------------: |
| Line as mean            | 0.5114437740883742 |  0.7247219446948274 |
| Probability matched     | 0.5069769906313601 |  0.7202160632931639 |

Maximum absolute decisive anchor probability error was `9.654831933936237e-9`. Both displayed aggregate losses decreased in this restricted diagnostic. Independent push calibration, slate-clustered uncertainty, subgroup adverse changes and a corrected-feature refitted predictor comparison are unavailable from this experiment. These values do not establish that a new model beats the closing market. No model-quality improvement is inferred from the correctness fixes.

## Fixture and activation

Only `tests/fixtures/models/browser-forecasting-model.json` was explicitly refitted from `tests/model/fixtures/synthetic-games.json`. Training cutoff remains `2024-09-22T17:00:00Z`. Its checksum is `2572f1c211ce3fb42cf8c5ec81d6b133cd3f1b9ebffe976c25756ca3b6e9b6c2`. This synthetic identity is for isolated acceptance only.

No real candidate was fitted because this execution explicitly authorized only the synthetic browser refit. A real candidate needs explicit source inputs, a new output path, chronological development evaluation including adverse changes, and a new journal registration before prospective activation. Existing frozen forecasts and registration times must not change. No market is released.
