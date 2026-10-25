# 06: Baseline probabilities

**What to build:** For a recorded full-game offer, PocketCheck can attach experimental win, loss, and push probabilities from a transparent prior-games baseline. The same margin distribution feeds compatible moneyline and spread results. Totals use their own distribution. A future game cannot leak into an earlier feature row. Unreleased artifacts do not become recommendations.

**Blocked by:** 01: Market mathematics, 02: Source evidence packet

**Status:** resolved

- [x] Synthetic dated games prove a later result cannot change an earlier feature row.
- [x] Probabilities come from an explicit distribution with integer tie and push mass. A predicted mean alone is not a cover probability.
- [x] Moneyline and spread outcomes are consistent with one margin distribution when the rules allow it.
- [x] Fit and evaluate commands record dataset hashes, feature definitions, training cutoff, and artifact checksums.
- [x] Evaluation reports probability quality, calibration counts, baselines, coverage, and uncertainty. Missing historical prices stay missing.
- [x] Artifacts remain local. Only a released experimental artifact is eligible for later value assessment.

## Answer

`src/lib/server/models` fits a prior-games margin and total baseline and turns residuals into integer bins. Moneyline and spread share the margin bins. A whole-number home line can push. Artifacts default to unreleased, so they are not value-recommendation eligible. `tests/model/baseline.test.ts` passed (4 tests). Artifacts are written under ignored `data/artifacts`. This is not a claim of profitability. The evaluation note is `docs/research/model-evaluation.md`.

## Comments

- 2026-10-25: Merged to `integrate/pocketcheck-mvp` from `ticket/06-baseline`.
