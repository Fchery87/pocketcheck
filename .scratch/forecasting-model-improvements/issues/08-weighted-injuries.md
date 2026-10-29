# 08: Injuries weighted by snap share and position

**What to build:** A snap count source feeds an injury impact per team and unit. Each player listed out or doubtful before the cutoff is weighted by recent snap share times a position value (the quarterback is handled by the starter state). Practice participation trend counts where published before the cutoff, and missing offensive line starters are counted. Kept only if the ablation shows a gain.

**Blocked by:** 03, 04

**Status:** resolved

- [x] A data command and edge parser for snap counts, with a retrieval record, license, and gaps
- [x] Injury impact uses only designations and snaps known before the cutoff; tested for no leakage
- [x] Position values are versioned in feature parameters
- [x] Injury coverage gaps keep the existing per-team rules; absent rows are unknown, not healthy
- [x] The ablation result and keep or drop decision are recorded
- [x] `npm run verify` passes

## Answer

A player out or doubtful counts as recent snap share times a versioned position value; a missing snap share is unknown and a designation without a publication time is ignored. `npm run data:snap-counts` downloads a season. The group is kept out of the fit until nflverse injury rows carry publication times and an ablation shows a gain.

Verified 2026-10-28 on `feature/forecasting-model-improvements`: `npm run verify` (540 unit tests, 31 browser tests) and `verify:database` (95 tests) pass.
