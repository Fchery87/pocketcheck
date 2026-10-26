# 17: Evaluate prospective forecasts under frozen release rules

**What to build:** Evaluate saved prospective forecasts against later observations under a protocol frozen before outcome inspection. Release remains blocked when independent evidence is missing or fails the agreed criteria.

**Blocked by:** 13: Show separate assessment and actual-bet performance, 14: Freeze prospective model inputs and forecasts, 16: Restore the journal atomically and repeatably

**Status:** resolved

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 42, 44, 46, 47, 48, 49, 53, 54.

- [x] Freeze an identifiable protocol containing artifact identity, input availability rules, markets, evaluation period, sample requirements, uncertainty method, and release criteria before its prospective outcomes are inspected.
- [x] Label the inspected historical holdout as development evidence. It cannot satisfy the independent protocol or release requirement.
- [x] Evaluate the forecasts actually saved at decision time against later settlements and closing observations. Do not rebuild past predictions using current artifacts, schedules, starter identities, or final scores.
- [x] Require at least 500 priced games per released market, no-worse Brier and log loss, and an upper endpoint at most zero for the slate-clustered 90% log-loss difference interval.
- [x] Missing metrics, unavailable intervals, inconclusive results, mismatched artifacts, and insufficient independent samples block release with a visible reason. Changing frozen rules requires a new protocol identity.
- [x] Keep timestamped executable offers distinct from closing comparison observations. Report the sample, missing observations, and provenance without asserting profitability from release eligibility.
- [x] Expose protocol identity, evaluation results, and blocking reasons through the existing model pipeline and relevant application model status. Preserve the deterministic policy and experimental labeling.
- [x] Verify valid passing and failing protocols with controlled frozen records, including restore and replay. No ticket requires waiting for 500 real future games or claiming that a market has earned release.
- [x] Run the established verification entry point and disposable database job, and verify the separate summary and recovery workflows remain intact.
- [x] Update model and capability documentation so development results, prospective evidence, and released eligibility have distinct accurate meanings.

## Answer

Protocol `prospective-2026-10-26` is frozen in code. It names the artifact, `decision-time-starters-v1` inputs, the three markets, an open period from 2026-10-26, 500 priced games, the existing slate-clustered 90% log-loss interval, and the no-worse Brier and log-loss rule with an upper endpoint at most zero. The inspected holdout stays development evidence and cannot release a market. `model:release` writes nothing from that report alone.

Evaluation scores probabilities saved on the forecast record against later outcomes and closing comparisons. It does not rebuild the prediction. A timestamped offer is not a close. Missing metrics, a missing interval, a mismatched artifact, a short sample, or a changed protocol id block release and say why. A controlled 500-game record can pass one market. That record is not a claim that any PocketCheck market is released, and the result says it is not a profitability claim.

Analysis model status shows the protocol id and the blocking reason. The policy is unchanged. Model JSON, including that status, still travels through the existing journal export and restore. No migration was added.

Verified here: prospective, release, model-status, and release-boundary unit tests. Not run: `npm run verify` and `npm run verify:database`. The coordinator runs those after merge.
