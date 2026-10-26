# 03: Remove chronological leakage from model evaluation

**What to build:** Generate historical predictions using only information available at their decision cutoff. Simultaneous games and chronological evaluation folds cannot learn from one another's outcomes.

**Blocked by:** None (can start immediately)

**Status:** resolved

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 42, 43.

- [x] Reproduce concurrent-outcome leakage through public feature or evaluation inputs before correcting it.
- [x] Generate all feature rows in a shared kickoff group before applying any outcome from that group. Reordering games within the group leaves the corresponding pregame features and predictions unchanged.
- [x] Changing a simultaneous game's final score does not affect another game's pregame prediction at that cutoff.
- [x] Keep kickoff groups intact across chronological training and validation folds. No fold uses an outcome from its validation kickoff group for fitting or residual construction.
- [x] Exclude earlier-started games when their result availability before the cutoff is not established. Preserve the evidence or explicit conservative availability rule used for eligible history.
- [x] Verify corrected behavior through the public fitting and evaluation pipeline with known expected examples, including overlapping games and exact cutoff boundaries.
- [x] Label previously affected evaluation results as superseded development evidence and update the documented chronological assumptions without claiming an improved betting advantage.

## Answer

The public pipeline regressions in [chronology.test.ts](../../../tests/model/chronology.test.ts) first failed on concurrent features, unavailable outcomes, and split kickoff groups. They now pass with unchanged pregame forecasts after concurrent score changes and input reordering. Known fold predictions exclude overlapping outcomes, and availability exactly at the cutoff stays excluded. Empty earlier residual history leaves calibration empty.

Explicit `resultAvailableAt` values remain in feature rows. Missing timestamps use the approved conservative kickoff-plus-24-hours estimate, recorded in new artifact `chronology` metadata. This estimate does not assert a source publication time or prove that a delayed game finished. [Model evaluation assumptions](../../../docs/research/model-evaluation.md) document the rule and mark the old historical scores as superseded development evidence.

Verification passed with isolated worktree dependencies. `npm test -- --testTimeout=20000 tests/model src/lib/server/analysis/model.test.ts` passed 78 tests. `svelte-kit sync` followed by `svelte-check --tsconfig ./tsconfig.json` reported zero errors and warnings. The fitting and evaluation CLI commands also completed against the synthetic fixture and emitted the chronology metadata while keeping the artifact unreleased.
