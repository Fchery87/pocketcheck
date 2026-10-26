# 02: Preserve immutable analysis snapshots

**What to build:** Save and display each analysis using its original game and research offer snapshot. Later schedule changes and refreshed analyses leave the original record unchanged.

**Blocked by:** 01: Isolate browser tests and establish CI verification

**Status:** ready-for-agent

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 1, 2, 3, 5, 20, 28.

- [ ] Persist a versioned per-analysis game snapshot and exact research offer through an additive migration. Reading an old analysis does not reconstruct its original details from mutable schedule records.
- [ ] Save an analysis, change the current kickoff and venue, then save another analysis for the same game. The first report and journal entry retain their original details after database readback.
- [ ] Keep original evidence, source times, decision cutoff, policy result, model identity, citations, and private lean attached to the correct analysis. Private lean remains excluded from the independent thesis packet.
- [ ] Preserve all completed analyses, including passes. Refreshes link to their parent without overwriting the parent.
- [ ] Backfill only facts recoverable from existing records and show uncertain legacy provenance explicitly. Do not invent original schedule values.
- [ ] Extend the shared memory and Neon storage contract with changed-schedule readback and verify the visible report through production-browser acceptance.
- [ ] Update capability documentation to state exactly which snapshot guarantees are delivered.
