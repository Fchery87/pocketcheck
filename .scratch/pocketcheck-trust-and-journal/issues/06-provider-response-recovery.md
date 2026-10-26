# 06: Recover provider responses and report complete usage

**What to build:** Preserve completed provider work before publishing a final report, recover finalization without another paid draft, and show the known usage of every drafting and repair request.

**Blocked by:** 05: Make analysis submissions durable and idempotent

**Status:** ready-for-agent

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 10, 11, 21, 22.

- [ ] Persist each provider request identifier, outcome, response, and available accounting before final report publication. Keep these records private and free of credentials.
- [ ] If finalization fails after response persistence, retry from the durable response without sending another provider request. Existing report validation still applies.
- [ ] When provider completion is ambiguous, show that status and require a deliberate new attempt before another potentially charged request. Do not claim exactly-once external execution.
- [ ] Include original and repair requests in token and cost totals. Retain first-request accounting when a repair fails or times out.
- [ ] Keep unreported usage fields unknown and identify partial totals. Unknown provider cost is not displayed as zero.
- [ ] Verify two metered responses, repair transport failure, interruption after response persistence, and final database-write failure through controlled provider transport and the application boundary.
- [ ] Show recovered state and accounting on the analysis page and document the recovery guarantees and remaining ambiguous-outcome limit.
