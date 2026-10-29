# 01: Artifact comparison and ablation reporting

**What to build:** `model:evaluate` can compare a candidate artifact with a previous artifact on identical games, and report each input group's contribution by scoring with and without it. It reports log loss and Brier score with slate-clustered intervals per market. Historical holdout results are labeled development evidence. It works on today's artifact, so later tickets can show their gain or drop an input group that does not help.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] The evaluation report gains a previous-artifact comparison on the identical game set, and rejects a comparison on mismatched games
- [x] The evaluation report gains an ablation section per input group, with slate-clustered 90% intervals on the log-loss difference
- [x] Reports label historical scores as development evidence; release still uses the existing gate and protocol
- [x] Report parsing at the edge validates the new sections; malformed sections are rejected before writing output
- [x] Model pipeline tests use checked-in fixtures, including a planted signal whose ablation shows a gain
- [x] `npm run verify` passes

## Answer

Candidate-versus-previous comparison on identical games and a per-input-group ablation are in the evaluation report, labeled development evidence. A comparison over mismatched games is rejected. Covered by `tests/model/ablation.test.ts`.

Verified 2026-10-28 on `feature/forecasting-model-improvements`: `npm run verify` (540 unit tests, 31 browser tests) and `verify:database` (95 tests) pass.
