# 09: Record complete actual-bet contracts

**What to build:** Record the bet actually placed with its own complete contract and stake while keeping its relationship to the original research visible.

**Blocked by:** 02: Preserve immutable analysis snapshots

**Status:** resolved

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 23, 24, 25, 26.

- [x] Capture market, selection, applicable point line, settlement rules, sportsbook, American odds, placement time, and positive stake units independently of the linked research offer.
- [x] Validate the actual contract using existing domain behavior. Make clear that research and execution can differ without changing the saved research.
- [x] Persist the actual-bet snapshot and submission identifier through additive schema changes, then display its own terms in the journal.
- [x] Repeated and concurrent submissions with one identifier create one actual-bet record. Reuse with changed inputs produces a conflict rather than an overwrite.
- [x] Legacy bets without independent contract fields retain visible provenance limits. Do not backfill an actual line by asserting that the research line was the execution line.
- [x] Verify a researched spread of -3 and an actual bet at -3.5 with independent price and placement time through browser entry and persistent readback.
- [x] Extend the shared storage contract and document the delivered actual-bet fields and legacy limitations.

## Answer

The journal stores the placed contract on the bet: market, selection, point line, full-game overtime rules, sportsbook, American odds, placement time, positive stake units, and a submission identifier. `parseOffer` validates that contract against the analysis kickoff. The researched offer stays unchanged when the placed line differs.

Migration `008_actual_bet_contracts.sql` adds `submission_id`, `contract`, and `contract_fingerprint`. A missing contract stays null and the journal says the market, line, and rules were not recorded. It does not copy the research line.

The same submission identifier, including two overlapping writes, returns one bet. A reuse with different terms returns a conflict and leaves the first record. Browser entry of a researched home spread at -3 and -110, then a placed home spread at -3.5 and -105, reads both back after reload. The Neon shared-store run was not executed: local Postgres rejected the available role, and no `TEST_DATABASE_URL` was set. Memory covers the same contract.
