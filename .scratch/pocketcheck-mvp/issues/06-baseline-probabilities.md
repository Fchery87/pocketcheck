# 06: Baseline probabilities

**What to build:** For a recorded full-game offer, PocketCheck can attach experimental win, loss, and push probabilities from a transparent prior-games baseline. The same margin distribution feeds compatible moneyline and spread results. Totals use their own distribution. A future game cannot leak into an earlier feature row. Unreleased artifacts do not become recommendations.

**Blocked by:** 01: Market mathematics, 02: Source evidence packet

**Status:** claimed

- [ ] Synthetic dated games prove a later result cannot change an earlier feature row.
- [ ] Probabilities come from an explicit distribution with integer tie and push mass. A predicted mean alone is not a cover probability.
- [ ] Moneyline and spread outcomes are consistent with one margin distribution when the rules allow it.
- [ ] Fit and evaluate commands record dataset hashes, feature definitions, training cutoff, and artifact checksums.
- [ ] Evaluation reports probability quality, calibration counts, baselines, coverage, and uncertainty. Missing historical prices stay missing.
- [ ] Artifacts remain local. Only a released experimental artifact is eligible for later value assessment.
