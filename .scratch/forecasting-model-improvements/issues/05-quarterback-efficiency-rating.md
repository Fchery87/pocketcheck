# 05: Quarterback efficiency rating

**What to build:** Quarterbacks are rated from play-by-play: recency-weighted EPA per dropback combined with completion percentage over expected, shrunk toward replacement level for few starts. The forecasting model uses the rating of the starter from the starter state. The input group is kept only if the ablation shows a held-out log-loss gain.

**Blocked by:** 02, 04

**Status:** resolved

- [x] The rating uses only plays from games eligible before the cutoff
- [x] Shrinkage toward replacement level is versioned in the artifact's feature parameters
- [x] A backup assumed starter uses the backup's rating
- [x] The ablation result is in the evaluation report, and the keep or drop decision is recorded in the model evaluation note
- [x] Model pipeline tests cover no-leakage and shrinkage on fixtures
- [x] `npm run verify` passes

## Answer

- `play-by-play.ts` now summarizes each passer's dropbacks (EPA per dropback, completion over expected); `efficiency-join.ts` attaches them to the schedule's games, which nothing did before, so quarterback and team efficiency were never fed from real data until now.
- The rating (`home_qb_efficiency`) is recency-weighted EPA per dropback plus CPOE / `qbCpoeScale`, weighted by dropbacks, shrunk toward `qbEfficiencyReplacement` (EPA units; the earlier code shrank toward a margin-points constant). Parameters are versioned in `featureParameters`.
- Tests in `tests/model/efficiency-features.test.ts` cover shrinkage, the CPOE scale, relief weighting, the backup's own rating, and no leakage from later games.
- Ablation on 2022-2025 (`docs/research/model-evaluation.md`): no clear gain (moneyline +0.0025, interval spans zero; spread -0.0028), so the group is dropped through `excludedGroups`. The code and tests stay so it can be re-tested as data grows.
