# 05: Quarterback efficiency rating

**What to build:** Quarterbacks are rated from play-by-play: recency-weighted EPA per dropback combined with completion percentage over expected, shrunk toward replacement level for few starts. The forecasting model uses the rating of the starter from the starter state. The input group is kept only if the ablation shows a held-out log-loss gain.

**Blocked by:** 02, 04

**Status:** ready-for-agent

- [ ] The rating uses only plays from games eligible before the cutoff
- [ ] Shrinkage toward replacement level is versioned in the artifact's feature parameters
- [ ] A backup assumed starter uses the backup's rating
- [ ] The ablation result is in the evaluation report, and the keep or drop decision is recorded in the model evaluation note
- [ ] Model pipeline tests cover no-leakage and shrinkage on fixtures
- [ ] `npm run verify` passes
