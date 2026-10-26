# 10: Freeze primary assessments before outcomes

**What to build:** Identify the primary eligible assessment for each game before outcomes are used and keep all later refreshes available without treating them as independent assessments.

**Blocked by:** 05: Make analysis submissions durable and idempotent

**Status:** ready-for-agent

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 27, 28, 37.

- [ ] Apply the existing earliest-completed eligible pregame rule per game without inspecting final scores or settlements.
- [ ] Persist the primary choice with its basis before outcome use. Handle concurrent completions deterministically and maintain a single primary per game.
- [ ] Display primary, refresh, and ineligible roles with understandable reasons in the journal. Keep all completed analyses, including passes, accessible.
- [ ] Refreshing an analysis or later recording an outcome cannot change the frozen primary choice.
- [ ] Historical data without trustworthy classification timing retains that limitation visibly rather than acquiring a fabricated pre-outcome claim.
- [ ] Verify completion-order ties, failed and interrupted attempts, after-cutoff ineligibility, and later refreshes through the application journal boundary and both stores.
- [ ] Document the primary-selection rule and the distinction between all-runs history and the independent primary cohort.
