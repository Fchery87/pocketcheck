# Implementation run: trustworthy research and complete journal

Done means every approved ticket is resolved on `integrate/pocketcheck-mvp`, all acceptance criteria work through the approved application or model pipeline seams, the required checks pass, and an independent code review has been addressed.

## Phases

1. Establish isolated browser and disposable-database verification.
2. Fix model chronology and validate external model artifacts.
3. Preserve immutable analysis and implement durable attempts, source recovery, and line-changing refreshes.
4. Complete actual-bet contracts, primary selection, settlements, closing offers, and summaries.
5. Freeze prospective forecasts, export and restore the journal, and evaluate under frozen release rules.
6. Review the full integration branch, fix findings, verify the user-visible workflow, then resolve local tickets.

## Execution rules

- Work only in an isolated ticket branch or the integration branch. Merge one verified ticket before starting its newly unblocked dependents.
- Keep each ticket reviewable and independently verified. Record actual results in `decisions.tsv`.
- The integration branch starts at `2080035`. Before-change checks at that revision passed format, lint, type checks, build, 241 unit tests on rerun, and 14 database integration tests. Browser acceptance had one pass and two failures; reproduce and fix its configuration isolation.
- Approved test seams are the application workflow and public model pipeline.
- Do not infer unavailable historical schedule, source publication, starter, or actual-bet facts. Preserve legacy uncertainty.
- Model release criteria apply only to a frozen independent protocol. No future performance or profitability is presumed.
