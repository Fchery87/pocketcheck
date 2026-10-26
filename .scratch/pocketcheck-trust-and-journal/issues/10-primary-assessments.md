# 10: Freeze primary assessments before outcomes

**What to build:** Identify the primary eligible assessment for each game before outcomes are used and keep all later refreshes available without treating them as independent assessments.

**Blocked by:** 05: Make analysis submissions durable and idempotent

**Status:** resolved

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 27, 28, 37.

- [x] Apply the existing earliest-completed eligible pregame rule per game without inspecting final scores or settlements.
- [x] Persist the primary choice with its basis before outcome use. Handle concurrent completions deterministically and maintain a single primary per game.
- [x] Display primary, refresh, and ineligible roles with understandable reasons in the journal. Keep all completed analyses, including passes, accessible.
- [x] Refreshing an analysis or later recording an outcome cannot change the frozen primary choice.
- [x] Historical data without trustworthy classification timing retains that limitation visibly rather than acquiring a fabricated pre-outcome claim.
- [ ] Verify completion-order ties, failed and interrupted attempts, after-cutoff ineligibility, and later refreshes through the application journal boundary and both stores. Memory passed. Neon was not run because TEST_DATABASE_URL was unset.
- [x] Document the primary-selection rule and the distinction between all-runs history and the independent primary cohort.

## Answer

The journal freezes one primary assessment per game when an attempt first reaches a terminal status. The rule is the existing one: the earliest completed analysis whose decision cutoff is strictly before kickoff. Later completed pregame analyses are refreshes. Failed and interrupted attempts are ineligible. A cutoff that is not strictly before kickoff is ineligible. The application also refuses a new analysis once kickoff has arrived, so that attempt never enters the cohort. Concurrent completions lock the game's classified rows and keep a single primary. Recording a bet does not reclassify the row. The journal lists every completed analysis, including passes, with the stored role and reason. Rows with no stored role or completion time stay unclassified. Migration `009_primary_assessments.sql` adds the columns and does not backfill a pre-outcome claim. Memory store contract passed (21 tests). Neon was not run: `TEST_DATABASE_URL` was unset.
