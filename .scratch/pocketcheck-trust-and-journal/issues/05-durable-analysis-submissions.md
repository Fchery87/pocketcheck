# 05: Make analysis submissions durable and idempotent

**What to build:** Acknowledge a saved research request before collection or drafting starts. Let the user return to its persisted progress, inspect failures, and retry deliberately without accidental duplicate work.

**Blocked by:** 02: Preserve immutable analysis snapshots

**Status:** resolved

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 6, 7, 8, 9, 12, 13, 14.

- [x] Persist the request identifier, immutable inputs, and pending state before any source or provider request. Reject reuse of the identifier with different inputs.
- [x] Concurrent submissions with the same identifier and unchanged inputs refer to one saved attempt. Enforce uniqueness in persistent storage and preserve the same behavior in memory.
- [x] Expose pending, running, completed, failed, and interrupted states through the application. Progress reflects persisted stages and remains readable after navigation or process restart.
- [x] Retain inputs and completed stages after failure or interruption. Explain available recovery actions and prevent automatic replay of ambiguous external work.
- [x] Show a pending state promptly and prevent accidental repeated form submissions. Retain valid values after validation errors.
- [x] Keep completed history readable after an attempt fails. An explicit refresh or deliberate new research run receives a new request identifier.
- [x] Verify interruption before collection, during external work, and before finalization through the application attempt boundary and shared memory and Neon storage contract.
- [x] Document which lifecycle and recovery behavior is delivered without promising durable provider-response reuse until ticket 06 is complete.

## Answer

Analysis forms now submit a stable request ID and fixed cutoff with the submitted values. The store creates a pending record before collection, enforces the existing unique database idempotency key, and rejects a reused ID when the input hash differs. Progress and collected evidence are persisted before drafting/finalization. A repeated unfinished or failed attempt is shown without replaying external work; the report page offers a deliberate new attempt, and refreshes use a new ID. Completed runs remain in history. Form submission shows a pending state and disables its submit button, and validation failures return the entered values.

Ticket 05 does not persist provider responses or provider usage before report finalization. If an interruption occurs after sending a provider request, the attempt is retained and not replayed automatically; the user must start a new attempt. Durable response reuse and complete accounting remain ticket 06 work. No exactly-once provider execution is claimed.

Verification: memory attempt contract, Neon attempt contract against the explicitly supplied disposable `TEST_DATABASE_URL`, production browser verification, and full project verification.
