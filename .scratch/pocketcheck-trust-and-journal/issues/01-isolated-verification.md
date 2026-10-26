# 01: Isolate browser tests and establish CI verification

**What to build:** Run the existing application acceptance workflow against a production build with verified fixture storage and controlled external responses. Provide one documented verification entry point locally and in CI, including an explicitly configured disposable database job.

**Blocked by:** None (can start immediately)

**Status:** claimed

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 50, 51, 52, 53, 54.

- [ ] Reproduce the browser suite selecting a configured provider instead of the fixture drafter. Record the observed cause and prove the isolation fix through the browser startup boundary.
- [ ] Before any research submission, assert the expected test mode, fixed clock, fixture sources, and isolated journal identity. Unexpected configuration fails before external work begins.
- [ ] Remove real provider credentials from test processes and reject unexpected outbound provider calls. Include a negative test that demonstrates the guard prevents a real-provider request.
- [ ] Run browser acceptance against the production build and verify the intended production form-origin behavior, including a valid submission and a rejected mismatched origin.
- [ ] Provide one command that runs formatting, lint, types, unit tests, production build, and isolated browser acceptance. CI invokes the same entry point.
- [ ] Run migrations and the shared storage contract in a separate required CI job using explicitly configured disposable database storage. Missing configuration fails visibly, and cleanup touches only test-owned storage.
- [ ] Give legitimate model-fitting tests an explicit execution budget while retaining their reproducibility assertions. Do not hide timeouts or skip required checks.
- [ ] Document the verification command, required test configuration, and distinction between automated fixture tests and optional live-provider experiments.
