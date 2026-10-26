# 06: Recover provider responses and report complete usage

**What to build:** Preserve completed provider work before publishing a final report, recover finalization without another paid draft, and show the known usage of every drafting and repair request.

**Blocked by:** 05: Make analysis submissions durable and idempotent

**Status:** resolved

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 10, 11, 21, 22.

- [x] Persist each provider request identifier, outcome, response, and available accounting before final report publication. Keep these records private and free of credentials.
- [x] If finalization fails after response persistence, retry from the durable response without sending another provider request. Existing report validation still applies.
- [x] When provider completion is ambiguous, show that status and require a deliberate new attempt before another potentially charged request. Do not claim exactly-once external execution.
- [x] Include original and repair requests in token and cost totals. Retain first-request accounting when a repair fails or times out.
- [x] Keep unreported usage fields unknown and identify partial totals. Unknown provider cost is not displayed as zero.
- [x] Verify two metered responses, repair transport failure, interruption after response persistence, and final database-write failure through controlled provider transport and the application boundary.
- [x] Show recovered state and accounting on the analysis page and document the recovery guarantees and remaining ambiguous-outcome limit.

## Answer

Each provider exchange is stored on the analysis before the report is published: request identifier, draft or repair role, completed, failed, or ambiguous outcome, response body, and whatever token and cost fields the provider returned. The snapshot holds those records. They contain model output only, not credentials. Combined usage sums known fields across the original draft and any repair. A missing token or cost field stays null, the total is marked partial, and unknown cost is never stored or shown as zero. A repair that fails in transit or times out keeps the first request's accounting.

If the final report write fails after that persistence, repeating the same request identifier validates the saved response and publishes it without another provider call. An ambiguous completion, including a timeout after the request was sent, is stored as failed with that status. Repeating the identifier does not send another request. A deliberate new request identifier can. The analysis page lists each request and the partial or complete total, and says when completion is ambiguous.

Verified with `node_modules/.bin/vp test run src/lib/server/analysis/store.test.ts` (20 passed) and `node_modules/.bin/vp test run tests/providers/transport.test.ts tests/providers/thesis.test.ts` (32 passed). Analysis and provider unit tests: 137 passed. Neon was not run because `TEST_DATABASE_URL` is unset.

Limit: ambiguous provider completion is not exactly-once. A later deliberate attempt can still be charged if the provider completed the earlier request after the process lost the response.

