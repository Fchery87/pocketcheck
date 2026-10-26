# 09: Record complete actual-bet contracts

**What to build:** Record the bet actually placed with its own complete contract and stake while keeping its relationship to the original research visible.

**Blocked by:** 02: Preserve immutable analysis snapshots

**Status:** ready-for-agent

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 23, 24, 25, 26.

- [ ] Capture market, selection, applicable point line, settlement rules, sportsbook, American odds, placement time, and positive stake units independently of the linked research offer.
- [ ] Validate the actual contract using existing domain behavior. Make clear that research and execution can differ without changing the saved research.
- [ ] Persist the actual-bet snapshot and submission identifier through additive schema changes, then display its own terms in the journal.
- [ ] Repeated and concurrent submissions with one identifier create one actual-bet record. Reuse with changed inputs produces a conflict rather than an overwrite.
- [ ] Legacy bets without independent contract fields retain visible provenance limits. Do not backfill an actual line by asserting that the research line was the execution line.
- [ ] Verify a researched spread of -3 and an actual bet at -3.5 with independent price and placement time through browser entry and persistent readback.
- [ ] Extend the shared storage contract and document the delivered actual-bet fields and legacy limitations.
