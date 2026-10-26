# 05: Make analysis submissions durable and idempotent

**What to build:** Acknowledge a saved research request before collection or drafting starts. Let the user return to its persisted progress, inspect failures, and retry deliberately without accidental duplicate work.

**Blocked by:** 02: Preserve immutable analysis snapshots

**Status:** ready-for-agent

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 6, 7, 8, 9, 12, 13, 14.

- [ ] Persist the request identifier, immutable inputs, and pending state before any source or provider request. Reject reuse of the identifier with different inputs.
- [ ] Concurrent submissions with the same identifier and unchanged inputs refer to one saved attempt. Enforce uniqueness in persistent storage and preserve the same behavior in memory.
- [ ] Expose pending, running, completed, failed, and interrupted states through the application. Progress reflects persisted stages and remains readable after navigation or process restart.
- [ ] Retain inputs and completed stages after failure or interruption. Explain available recovery actions and prevent automatic replay of ambiguous external work.
- [ ] Show a pending state promptly and prevent accidental repeated form submissions. Retain valid values after validation errors.
- [ ] Keep completed history readable after an attempt fails. An explicit refresh or deliberate new research run receives a new request identifier.
- [ ] Verify interruption before collection, during external work, and before finalization through the application attempt boundary and shared memory and Neon storage contract.
- [ ] Document which lifecycle and recovery behavior is delivered without promising durable provider-response reuse until ticket 06 is complete.
