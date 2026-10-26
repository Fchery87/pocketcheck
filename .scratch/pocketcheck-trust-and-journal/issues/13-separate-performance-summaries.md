# 13: Show separate assessment and actual-bet performance

**What to build:** Read system assessment performance separately from actual-bet performance, with clear sample counts, denominators, and missing-data explanations.

**Blocked by:** 10: Freeze primary assessments before outcomes, 11: Settle assessments and bets with correction history, 12: Record and compare closing offers

**Status:** ready-for-agent

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 35, 36, 37, 53, 54.

- [ ] Expose separate views for frozen primary assessments and actual bets. Keep refreshes in the history without pooling them into an independent assessment sample.
- [ ] Show settled, unresolved, push, void, and missing-closing counts and the denominator used for each displayed metric.
- [ ] Apply existing domain rules for refunded stakes and unavailable values. Missing closing data and unresolved results are not zero performance observations.
- [ ] Actual-bet returns use recorded stake units and the actual contract. Assessment results use the independently frozen research contract.
- [ ] Settlement corrections update the effective summaries while preserving the prior event history.
- [ ] Verify exact expected results for a mixed cohort containing wins, losses, refunds, unresolved records, refreshes, and missing closing observations.
- [ ] Exercise the separate views through production-browser acceptance and update capability documentation to describe reachable behavior rather than helper completion.
