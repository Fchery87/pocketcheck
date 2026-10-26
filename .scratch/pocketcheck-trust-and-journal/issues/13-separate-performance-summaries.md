# 13: Show separate assessment and actual-bet performance

**What to build:** Read system assessment performance separately from actual-bet performance, with clear sample counts, denominators, and missing-data explanations.

**Blocked by:** 10: Freeze primary assessments before outcomes, 11: Settle assessments and bets with correction history, 12: Record and compare closing offers

**Status:** resolved

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 35, 36, 37, 53, 54.

- [x] Expose separate views for frozen primary assessments and actual bets. Keep refreshes in the history without pooling them into an independent assessment sample.
- [x] Show settled, unresolved, push, void, and missing-closing counts and the denominator used for each displayed metric.
- [x] Apply existing domain rules for refunded stakes and unavailable values. Missing closing data and unresolved results are not zero performance observations.
- [x] Actual-bet returns use recorded stake units and the actual contract. Assessment results use the independently frozen research contract.
- [x] Settlement corrections update the effective summaries while preserving the prior event history.
- [x] Verify exact expected results for a mixed cohort containing wins, losses, refunds, unresolved records, refreshes, and missing closing observations.
- [x] Exercise the separate views through production-browser acceptance and update capability documentation to describe reachable behavior rather than helper completion.

**Status:** resolved

## Answer

The journal shows two performance views. Frozen primary assessments use one unit on the researched contract. Actual bets use recorded stake units and the placed contract. Refreshes stay in the history and out of the primary sample. Each view states settled, unresolved, push, void, and missing-closing counts, plus the return and closing-comparison denominators. Push, void, unresolved, and missing closes are not part of the return and are not zero. A correction changes the effective grade, which is what the summary reads, and the earlier notice stays in the history.

A mixed helper cohort of five primaries and one refresh (win 0.91, loss -1, push, void, unresolved, and a refresh win) returns -0.045 on a denominator of 2 settled units, with 1 unresolved, 1 push, 1 void, 1 refresh, and 3 missing closes. Four actual bets (win +1.82 on 2 units, loss -1 on 1 unit, void of 3, unresolved of 4) return about 0.2733 on a denominator of 3 settled stake units. Production browser acceptance graded a researched home -3 as a push and a placed home -3.5 for 2 units as a loss of -1, and the two views showed those results separately.
