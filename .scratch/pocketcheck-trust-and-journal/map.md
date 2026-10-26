# Trustworthy research and complete journal

Status: ready-for-agent
Type: task

## Notes

- [The specification](spec.md) is the authoritative scope and acceptance contract.
- The user confirmed the application workflow and public model pipeline as the two primary test seams.
- This effort follows the MVP. It completes missing application integration and corrects guarantees identified in the project review.
- The user approved the 17-ticket breakdown and its blocking edges. Each published ticket is ready-for-agent.
- Start with the lowest-numbered unclaimed ticket whose blockers are resolved. The initial frontier is 01, 03, and 04.

## Decisions-so-far

- Preserve the existing application, deterministic policy, private-lean separation, provider adapters, and journal.
- Freeze analysis snapshots independently of current schedules.
- Persist attempts before external work and preserve provider responses and accounting before finalization.
- Complete actual-bet contracts, settlement, closing observations, separate summaries, and recovery before expanding sports or model features.
- Correct chronological evaluation, reject invalid external records, and treat the inspected holdout as development evidence.
- Require isolated production-browser acceptance and disposable database verification before completion.
- [Ticket 01](issues/01-isolated-verification.md) provides the shared verification commands, startup fixture assertions, outbound guard, and disposable database CI job. Synthetic reproduction proves that a missing memory-journal override can expose a stored provider choice through dotenv-selected Neon storage. The original historical override failure remains inconclusive.

## Fog

- The original root-workspace provider-selection failure remains unexplained. Synthetic production-browser reproduction confirmed that an unset memory-journal override lets `.env` select Neon and read the stored `theclawbay:grok-4.7` choice. Credentials alone do not select a provider. Ticket 01 rejects that configuration before startup and checks the effective fixture drafter before submission. The original inline `POCKETCHECK_JOURNAL=memory` command selected fixture in the isolated reproduction.
- Legacy records may lack original game snapshots, independent actual-bet contracts, or timestamped starter assumptions. Preserve and label those limitations.
- Prospective performance is unknown. Implementing the evaluation protocol does not establish that a market qualifies for release.

## Tickets

| Ticket                                                                                                       | Blocked by             |
| ------------------------------------------------------------------------------------------------------------ | ---------------------- |
| [01: Isolate browser tests and establish CI verification](issues/01-isolated-verification.md)                | None                   |
| [02: Preserve immutable analysis snapshots](issues/02-immutable-analysis-snapshots.md)                       | 01                     |
| [03: Remove chronological leakage from model evaluation](issues/03-chronological-model-evaluation.md)        | None                   |
| [04: Reject invalid model artifacts and evaluation reports](issues/04-validated-model-inputs.md)             | None                   |
| [05: Make analysis submissions durable and idempotent](issues/05-durable-analysis-submissions.md)            | 02                     |
| [06: Recover provider responses and report complete usage](issues/06-provider-response-recovery.md)          | 05                     |
| [07: Enforce evidence coverage and graceful source failure](issues/07-evidence-coverage.md)                  | 05                     |
| [08: Support accurate offer entry and line-changing refreshes](issues/08-line-changing-refreshes.md)         | 05                     |
| [09: Record complete actual-bet contracts](issues/09-actual-bet-contracts.md)                                | 02                     |
| [10: Freeze primary assessments before outcomes](issues/10-primary-assessments.md)                           | 05                     |
| [11: Settle assessments and bets with correction history](issues/11-settlements-and-corrections.md)          | 09, 10                 |
| [12: Record and compare closing offers](issues/12-closing-offers.md)                                         | 09                     |
| [13: Show separate assessment and actual-bet performance](issues/13-separate-performance-summaries.md)       | 10, 11, 12             |
| [14: Freeze prospective model inputs and forecasts](issues/14-frozen-prospective-forecasts.md)               | 02, 03, 04             |
| [15: Export the complete journal](issues/15-journal-export.md)                                               | 06, 07, 08, 11, 12, 14 |
| [16: Restore the journal atomically and repeatably](issues/16-journal-restore.md)                            | 15                     |
| [17: Evaluate prospective forecasts under frozen release rules](issues/17-prospective-evaluation-release.md) | 13, 14, 16             |
