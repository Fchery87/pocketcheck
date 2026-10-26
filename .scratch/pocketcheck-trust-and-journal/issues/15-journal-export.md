# 15: Export the complete journal

**What to build:** Download a versioned journal backup containing the research, execution, attempt, and outcome records needed for faithful recovery.

**Blocked by:** 06: Recover provider responses and report complete usage, 07: Enforce evidence coverage and graceful source failure, 08: Support accurate offer entry and line-changing refreshes, 11: Settle assessments and bets with correction history, 12: Record and compare closing offers, 14: Freeze prospective model inputs and forecasts

**Status:** ready-for-agent

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 38, 39.

- [ ] Expose journal export in the application and include identifiers, original timestamps, parent links, immutable analysis snapshots, evidence, gaps, manual coverage, and policy results.
- [ ] Include actual-bet contracts and stakes, primary classifications, closing observations, settlement and correction history, frozen forecasts, and provider attempt accounting.
- [ ] Preserve failed, interrupted, and ambiguous attempts and their recoverable durable responses, while excluding credentials and credential-bearing request headers.
- [ ] Exclude bulk source caches and model training datasets. Keep the forecast identities and recorded inputs required for journal recovery.
- [ ] Declare a backup format version and retain provenance limits for legacy records. Export does not invent missing historical facts.
- [ ] Read the downloaded artifact and verify relationships, exact timestamps, accounting, and history against saved records. Inject secret sentinels and prove they do not appear in the backup.
- [ ] Verify download through production-browser acceptance and document backup contents, confidentiality, and the versioned recovery contract.
