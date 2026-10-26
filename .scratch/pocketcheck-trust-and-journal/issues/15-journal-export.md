# 15: Export the complete journal

**What to build:** Download a versioned journal backup containing the research, execution, attempt, and outcome records needed for faithful recovery.

**Blocked by:** 06: Recover provider responses and report complete usage, 07: Enforce evidence coverage and graceful source failure, 08: Support accurate offer entry and line-changing refreshes, 11: Settle assessments and bets with correction history, 12: Record and compare closing offers, 14: Freeze prospective model inputs and forecasts

**Status:** resolved

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 38, 39.

- [x] Expose journal export in the application and include identifiers, original timestamps, parent links, immutable analysis snapshots, evidence, gaps, manual coverage, and policy results.
- [x] Include actual-bet contracts and stakes, primary classifications, closing observations, settlement and correction history, frozen forecasts, and provider attempt accounting.
- [x] Preserve failed, interrupted, and ambiguous attempts and their recoverable durable responses, while excluding credentials and credential-bearing request headers.
- [x] Exclude bulk source caches and model training datasets. Keep the forecast identities and recorded inputs required for journal recovery.
- [x] Declare a backup format version and retain provenance limits for legacy records. Export does not invent missing historical facts.
- [x] Read the downloaded artifact and verify relationships, exact timestamps, accounting, and history against saved records. Inject secret sentinels and prove they do not appear in the backup.
- [x] Verify download through production-browser acceptance and document backup contents, confidentiality, and the versioned recovery contract. The production browser downloads the journal the page uses, including the correction reason, and a secret sentinel is absent. Backup contents remain documented in `docs/testing.md`.

The production browser now downloads the same journal the page reads. Backup contents, confidentiality, and the version 1 recovery contract are documented in `docs/testing.md`.

## Answer

The journal page links to `/journal/export`, which downloads `pocketcheck-journal-v1.json`. Format version is 1. The file is the existing journal export: games, offers, linked evidence, analyses with snapshots, reports, private research, bets, settlements, and closing observations. Analyses keep identifiers, original timestamps, parent links, gaps, policy, primary classification, usage, frozen forecasts, and provider attempts, including failed and ambiguous outcomes. Durable response bodies stay. Credential-named fields such as `authorization` and `apiKey` are removed. Settings rows and training tables are not queried. Legacy provenance values are copied as stored.

A disposable Postgres test saved a failed analysis with an ambiguous attempt, a forecast, a placed contract and stake, and a closing observation, plus a settings row holding `sk-sentinel`. The downloaded JSON matched those records and timestamps. The sentinel and the words `authorization` and `apiKey` were absent. Restoring the existing export, including closings, still round-trips. Ticket 16 still owns atomic restore validation.
