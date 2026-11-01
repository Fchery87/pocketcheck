# Evidence and evaluation extensions

Status: research only. Documentation delivered, experiments and activation pending.
Type: research.
Blocked by: implementation plan Tasks 12 and 15 for subsequent experiments and integration.

## Goal and scope

Document Task 16 of the [implementation plan](../../docs/plans/2026-11-01-review-remediation-implementation.md) under the existing [architecture](../../docs/plans/2026-11-01-review-remediation-architecture.md). The [research note](../../docs/research/2026-11-01-evidence-evaluation-extensions.md) defines provenance, eligible sample, comparison, exclusions, and activation for every proposal.

The deliverable owns only this spec and that note. It changes no code, shared plan, audit, live configuration, artifact, database, or release policy. No experiments ran. The implementation prerequisites are not claimed complete.

## Required research contracts

1. Structured manual QB evidence records player identity, team, position, designation, assertion kind, source URL, publication time, retrieval time, and entry time. Overrides identify superseded evidence and preserve conflicts. Unknown publication time cannot establish a starter. Private lean is never evidence.
2. Non-QB research first measures publication-time, roster-join, and prior snap-count coverage. Missing rows and unknown snaps never mean healthy or zero impact. A fitted feature waits for a declared coverage threshold and audit.
3. Era baselines, garbage-time filters, weather interactions, and alternate de-vig are separate chronological experiments. Each fixes the other inputs, declares its sample, and records paired comparisons and exclusions. No combined score justifies an individual change.
4. Independent push calibration uses frozen primary model picks and later contract-aware settlements. It reports absolute push calibration and a prior-only empirical baseline. It does not change the shared-push v1 relative-loss comparator.
5. Moved-line references require observed alternate prices at the original contract or a separately validated distribution. Inferred reference probabilities remain distinct from observed comparable closes and never fill the v1 close baseline.
6. A successor protocol design must freeze identity, cohort, chronology, baseline, push treatment, close rules, missingness, metrics, uncertainty, thresholds, and stopping rules before observations. It preserves v1 results. This research design is incomplete until those choices are fixed and registered.

## Acceptance and activation

All nine proposal sections in the note must state provenance, eligible sample, comparison, exclusions, and activation. Cite actual local sources, not assumed capabilities. Label historical scores as development evidence and identify missing point-in-time archives.

A later implementation must test boundary parsing, provenance, chronology, conflicts, saved probabilities, contract grading, and export preservation through the existing owners. Changed model semantics require cache/training versions, chronological validation, refit at a new path, and a new actual-time registration. Use [testing guidance](../../docs/testing.md) for application and disposable-database verification. Documentation checks do not verify those workflows.

Only `prospective-2026-10-26` can authorize release under current project instructions. Its 500-priced-game minimum, no-worse Brier and log loss, and slate-clustered 90% interval requirement remain unchanged. Reopening [ADR 0004](../../docs/adr/0004-register-prospective-artifacts.md) and obtaining explicit project-policy authorization are necessary before a successor can authorize release. A valid parser result is not authorization.

## Delivery validation

Run formatting only on the two owned paths. Check every local Markdown target and fragment, the five required fields in each proposal, and prohibited long-dash punctuation. Inspect these actual artifacts before reporting completion. The Prove It Works principle changes the completion check from a draft claim to direct artifact checks.

No commit, staging, nested agents, provider requests, source downloads, model fitting, or database access belongs to this delivery. Coverage counts, empirical thresholds, candidate performance, and future protocol decisions remain unmeasured follow-up work.
