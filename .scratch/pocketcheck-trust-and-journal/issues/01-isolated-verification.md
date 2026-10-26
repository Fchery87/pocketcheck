# 01: Isolate browser tests and establish CI verification

**What to build:** Run the existing application acceptance workflow against a production build with verified fixture storage and controlled external responses. Provide one documented verification entry point locally and in CI, including an explicitly configured disposable database job.

**Blocked by:** None (can start immediately)

**Status:** resolved

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 50, 51, 52, 53, 54.

- [x] Reproduce the browser suite selecting a configured provider instead of the fixture drafter. Record the observed cause and prove the isolation fix through the browser startup boundary.
- [x] Before any research submission, assert the expected test mode, fixed clock, fixture sources, and isolated journal identity. Unexpected configuration fails before external work begins.
- [x] Remove real provider credentials from test processes and reject unexpected outbound provider calls. Include a negative test that demonstrates the guard prevents a real-provider request.
- [x] Run browser acceptance against the production build and verify the intended production form-origin behavior, including a valid submission and a rejected mismatched origin.
- [x] Provide one command that runs formatting, lint, types, unit tests, production build, and isolated browser acceptance. CI invokes the same entry point.
- [x] Run migrations and the shared storage contract in a separate required CI job using explicitly configured disposable database storage. Missing configuration fails visibly, and cleanup touches only test-owned storage.
- [x] Give legitimate model-fitting tests an explicit execution budget while retaining their reproducibility assertions. Do not hide timeouts or skip required checks.
- [x] Document the verification command, required test configuration, and distinction between automated fixture tests and optional live-provider experiments.

## Answer

Production acceptance now runs with a scrubbed environment, a verified fixture configuration and journal identity, and an outbound-request guard. `npm run verify` is the shared local and CI entry point. A separate required database job uses explicitly configured disposable storage.

The reproduced failure class is a missing memory-journal override combined with dotenv-selected Neon storage and a persisted provider choice. The historical root-workspace failure is inconclusive. The original inline `POCKETCHECK_JOURNAL=memory` startup selected the fixture when tested with a synthetic `.env`. Provider credentials alone cannot change the selected drafter. The resolver reads the choice from settings first and returns the fixture before reading keys.

A controlled production-browser reproduction used a disposable PostgreSQL schema containing `{"provider":"theclawbay","modelId":"grok-4.7"}` in settings. A synthetic `.env` supplied that schema, `POCKETCHECK_JOURNAL=neon`, and a fake provider key, while the memory-journal override was absent. The browser showed `Current: theclawbay:grok-4.7`. All outbound fetches were blocked before application startup. The new guarded launcher, given the same synthetic `.env`, exited with `Unsafe browser verification configuration: POCKETCHECK_JOURNAL` before listening. The durable startup regression covers this missing-override and dotenv-contamination case. This establishes the configuration failure class and prevention, without claiming it explains why the original inline override failed.

After merging integration commit `b147dbd`, full lint and Svelte/type checks passed, `npm test` passed 262 tests, production build passed, and production browser acceptance passed all four tests. `npm run verify:database` passed 14 tests against explicitly configured disposable PostgreSQL 16 storage, applying all migrations in generated schemas. Cleanup left zero generated integration schemas. Negative tests reject missing disposable database configuration, unexpected test startup values, and an outbound request from the real DeepSeek adapter before transport. The throughput test retains its existing threshold and runs after other unit workers finish. Fitting and reproducibility tests retain their assertions with explicit budgets.

The full `npm run verify` entry point currently stops at pre-existing formatting in the tracker map's table. The integration owner is handling tracker formatting. Ticket-owned file formatting passes. No CI run or branch-protection change is claimed.
