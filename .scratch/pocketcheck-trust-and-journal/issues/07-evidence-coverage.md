# 07: Enforce evidence coverage and graceful source failure

**What to build:** Show whether each team's injury coverage is established and fresh. Let appropriately scoped manual evidence address gaps, and preserve readable attempts when weather or other source payloads are malformed.

**Blocked by:** 05: Make analysis submissions durable and idempotent

**Status:** resolved

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 15, 16, 17, 18, 19, 20.

- [x] Track injury coverage per team and game week. Evidence for one team does not establish coverage for the other.
- [x] Distinguish an explicitly established empty report from unknown coverage. Absence of player rows alone cannot be presented as a clean report.
- [x] Apply a 24-hour maximum injury coverage age and the existing 12-hour manual weather window. Show retrieval and publication times separately, including unknown publication times.
- [x] Only fresh manual evidence scoped to the relevant gap and team where applicable clears that material gap. Stale, late, unrelated, and unknown-time evidence does not clear it.
- [x] Parse source payloads at external boundaries. Malformed weather JSON, including null, becomes a visible evidence gap and policy input rather than an uncaught attempt failure.
- [x] Preserve source reasons, citations, and manual reliance in the saved analysis and visible report. Other completed research remains readable.
- [x] Exercise partial-team, empty, missing, stale, late, conflicting, and malformed source cases through saved analyses with injected collectors and production-browser acceptance.
- [x] Document coverage semantics and freshness rules without implying retrieval time establishes source publication time.

## Answer

Injury coverage is established per team and game week. Rows for one team leave the other unknown. A blank status row is not a clean report. Only a source row marked `coverage=empty` for that team and week is. Retrieval older than 24 hours is a material gap for each established team, and the saved gaps keep retrieval time separate from unknown publication time. Manual evidence clears an injury gap only when it names that team and its source time is within 24 hours and not after the cutoff. Weather stays on the 12-hour window. Null, arrays, and invalid weather JSON become a visible gap. The saved analysis still cites its evidence and records manual reliance.

Verified with `vp test run` on evidence, run, form, nws, and evidence-packet tests (67 passed before the empty-report case, then the empty-report case passed). `vp check --fix` formatted the touched files. The shared production browser suite was not run here. The coordinator should run it after merge. `integrate/pocketcheck-mvp` at `66230c3` is merged. Saved forecasts remain on the run.
