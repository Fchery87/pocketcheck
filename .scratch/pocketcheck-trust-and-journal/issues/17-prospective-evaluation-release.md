# 17: Evaluate prospective forecasts under frozen release rules

**What to build:** Evaluate saved prospective forecasts against later observations under a protocol frozen before outcome inspection. Release remains blocked when independent evidence is missing or fails the agreed criteria.

**Blocked by:** 13: Show separate assessment and actual-bet performance, 14: Freeze prospective model inputs and forecasts, 16: Restore the journal atomically and repeatably

**Status:** ready-for-agent

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 42, 44, 46, 47, 48, 49, 53, 54.

- [ ] Freeze an identifiable protocol containing artifact identity, input availability rules, markets, evaluation period, sample requirements, uncertainty method, and release criteria before its prospective outcomes are inspected.
- [ ] Label the inspected historical holdout as development evidence. It cannot satisfy the independent protocol or release requirement.
- [ ] Evaluate the forecasts actually saved at decision time against later settlements and closing observations. Do not rebuild past predictions using current artifacts, schedules, starter identities, or final scores.
- [ ] Require at least 500 priced games per released market, no-worse Brier and log loss, and an upper endpoint at most zero for the slate-clustered 90% log-loss difference interval.
- [ ] Missing metrics, unavailable intervals, inconclusive results, mismatched artifacts, and insufficient independent samples block release with a visible reason. Changing frozen rules requires a new protocol identity.
- [ ] Keep timestamped executable offers distinct from closing comparison observations. Report the sample, missing observations, and provenance without asserting profitability from release eligibility.
- [ ] Expose protocol identity, evaluation results, and blocking reasons through the existing model pipeline and relevant application model status. Preserve the deterministic policy and experimental labeling.
- [ ] Verify valid passing and failing protocols with controlled frozen records, including restore and replay. No ticket requires waiting for 500 real future games or claiming that a market has earned release.
- [ ] Run the established verification entry point and disposable database job, and verify the separate summary and recovery workflows remain intact.
- [ ] Update model and capability documentation so development results, prospective evidence, and released eligibility have distinct accurate meanings.
