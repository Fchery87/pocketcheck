# 07: Enforce evidence coverage and graceful source failure

**What to build:** Show whether each team's injury coverage is established and fresh. Let appropriately scoped manual evidence address gaps, and preserve readable attempts when weather or other source payloads are malformed.

**Blocked by:** 05: Make analysis submissions durable and idempotent

**Status:** ready-for-agent

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 15, 16, 17, 18, 19, 20.

- [ ] Track injury coverage per team and game week. Evidence for one team does not establish coverage for the other.
- [ ] Distinguish an explicitly established empty report from unknown coverage. Absence of player rows alone cannot be presented as a clean report.
- [ ] Apply a 24-hour maximum injury coverage age and the existing 12-hour manual weather window. Show retrieval and publication times separately, including unknown publication times.
- [ ] Only fresh manual evidence scoped to the relevant gap and team where applicable clears that material gap. Stale, late, unrelated, and unknown-time evidence does not clear it.
- [ ] Parse source payloads at external boundaries. Malformed weather JSON, including null, becomes a visible evidence gap and policy input rather than an uncaught attempt failure.
- [ ] Preserve source reasons, citations, and manual reliance in the saved analysis and visible report. Other completed research remains readable.
- [ ] Exercise partial-team, empty, missing, stale, late, conflicting, and malformed source cases through saved analyses with injected collectors and production-browser acceptance.
- [ ] Document coverage semantics and freshness rules without implying retrieval time establishes source publication time.
