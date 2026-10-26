# PocketCheck trustworthy research and complete journal

Status: ready-for-agent
Type: task
Test seams confirmed by the user on 2026-10-25.

## Problem Statement

The user needs a research record they can trust before and after kickoff. PocketCheck can produce a sourced analysis and record an actual bet, but the application does not yet complete the journey through settlement, corrections, closing observations, performance summaries, and recovery.

Several current behaviors weaken that record. A later schedule update can change game details displayed on an older analysis. Analysis inputs and paid drafting responses are not durable until final persistence. Historical features can incorporate concurrent outcomes, and malformed evaluation scores can pass the model release gate. Injury evidence does not establish coverage for each team independently. Browser tests have also failed to demonstrate the intended isolation from configured providers.

The user needs these gaps addressed before expanding supported sports or investing in more model features. Passing helper tests must not be mistaken for delivering a complete application workflow or proving a betting advantage.

## Solution

Complete a reliable NFL pregame research and journal workflow within the existing local application. Preserve the exact game, offer, evidence, assumptions, model identity, and policy result for each analysis. Save analysis attempts before external work, expose progress and recovery, and preserve all known provider usage across drafting attempts.

Let the user record an actual bet's complete contract independently of the research offer. Add settlement, correction history, comparable closing observations, separate assessment and actual-bet summaries, and journal export and restore.

Correct chronological evaluation and reject invalid artifacts and evaluation reports. Treat the previously inspected historical holdout as development evidence. Support a frozen prospective evaluation protocol that uses information available at the decision cutoff. Keep experimental value eligibility blocked until the applicable release requirements are met.

Make isolated browser acceptance and database verification part of the delivery workflow. A feature is complete when its intended user journey works through the application and its persisted records survive readback and recovery.

## User Stories

1. As a researcher, I want each analysis to preserve its original matchup and schedule details, so that later schedule corrections cannot rewrite my record.
2. As a researcher, I want each analysis to freeze the exact offer and observation time, so that its conclusion remains tied to the price I researched.
3. As a researcher, I want a refresh to create a linked analysis, so that I can compare changes without replacing the earlier report.
4. As a researcher, I want a refresh to accept a changed spread or total line, so that I can follow the actual market contract.
5. As a researcher, I want private lean and rationale kept outside the independent thesis packet, so that my preference does not steer the system's assessment.
6. As a researcher, I want the application to acknowledge and save my request before external work starts, so that a slow request does not become untraceable work.
7. As a researcher, I want visible progress and a stable analysis identifier, so that I can leave and return to an unfinished request.
8. As a researcher, I want repeated submission of the same request to return the existing attempt, so that a double click does not create duplicate work.
9. As a researcher, I want interrupted attempts to retain their inputs and completed stages, so that I can understand what happened before retrying.
10. As a researcher, I want a completed provider response preserved before report finalization, so that a later write failure does not require another paid draft.
11. As a researcher, I want ambiguous provider outcomes identified explicitly, so that a retry does not silently repeat a potentially charged request.
12. As a researcher, I want recoverable failures to explain the next available action, so that I can continue without re-entering valid research.
13. As a researcher, I want my entered values retained after validation errors, so that correcting one field does not discard the rest.
14. As a researcher, I want market controls to show valid selections and line conventions, so that I can enter the intended contract correctly.
15. As a researcher, I want injury coverage established for each team, so that evidence for one team cannot hide missing evidence for its opponent.
16. As a researcher, I want an explicitly empty injury report distinguished from unavailable coverage, so that absence of player rows is not misrepresented.
17. As a researcher, I want stale injury evidence and unknown publication times visible, so that I can judge whether current availability is established.
18. As a researcher, I want manual evidence to clear only the relevant fresh coverage gap, so that unrelated evidence cannot remove a blocker.
19. As a researcher, I want malformed or unavailable weather responses recorded as evidence gaps, so that a source failure does not discard the analysis attempt.
20. As a researcher, I want claims linked to the evidence actually supplied, so that I can inspect their support.
21. As a researcher, I want provider usage to include both the original draft and any repair, so that reported totals reflect every known charged request.
22. As a researcher, I want missing usage or cost labeled unknown, so that unavailable accounting is not presented as free inference.
23. As a bettor, I want an actual bet linked to its analysis but stored separately, so that my execution remains distinct from the system's recommendation.
24. As a bettor, I want an actual bet to preserve its own market, side, line, rules, sportsbook, odds, and placement time, so that it represents the contract I placed.
25. As a bettor, I want to record stake in units, so that actual-bet performance reflects my recorded exposure.
26. As a bettor, I want duplicate bet submissions prevented, so that the journal does not count one placement twice.
27. As a researcher, I want the primary eligible assessment selected without reading outcomes, so that later refreshes cannot inflate the system's independent sample.
28. As a researcher, I want all completed analyses retained, including passes, so that the journal does not select only attractive recommendations.
29. As a bettor, I want results recorded as win, loss, push, void, or unresolved, so that grading reflects the applicable contract.
30. As a bettor, I want postponements to remain unresolved until an applicable result exists, so that they are not counted as losses.
31. As a bettor, I want duplicate settlement notices ignored, so that repeated information does not change performance totals.
32. As a bettor, I want settlement corrections to preserve the earlier result and correction reason, so that the history remains auditable.
33. As a researcher, I want to record a closing offer with its observation time and source, so that closing comparisons use an identifiable observation.
34. As a researcher, I want incompatible closing contracts excluded from direct price comparison, so that line movement is not confused with a change in odds.
35. As a researcher, I want missing closing prices shown as unavailable, so that missing information is never counted as zero performance.
36. As a researcher, I want system assessment summaries separate from actual-bet summaries, so that I can distinguish research quality from my execution choices.
37. As a researcher, I want refreshes and unresolved records identified in summaries, so that sample sizes and denominators are understandable.
38. As a researcher, I want a journal export that includes relationships, snapshots, and history, so that I can recover my research after a failure.
39. As a researcher, I want credentials and bulk source caches excluded from exports, so that a backup contains only the journal information it needs.
40. As a researcher, I want restore validation before writes, so that an incompatible or damaged backup cannot partially corrupt my journal.
41. As a researcher, I want repeated restoration of the same records to avoid duplication, so that recovery is safe to repeat.
42. As a model maintainer, I want historical features to exclude outcomes unavailable at the prediction cutoff, so that backtests do not use future information.
43. As a model maintainer, I want simultaneous games kept together when building features and chronological folds, so that row ordering cannot leak concurrent outcomes.
44. As a model maintainer, I want archived starter identities distinguished from timestamped starter assumptions, so that evaluation matches the information available during live research.
45. As a model maintainer, I want malformed artifacts and evaluation reports rejected before use, so that invalid data cannot enable recommendations.
46. As a model maintainer, I want release tied to the exact artifact and a frozen evaluation protocol, so that results cannot be attached to a different model.
47. As a model maintainer, I want the inspected historical holdout labeled as development evidence, so that repeated model selection is not described as independent validation.
48. As a model maintainer, I want prospective forecasts frozen before outcomes arrive, so that later evaluation measures the deployed research process.
49. As a model maintainer, I want release criteria fixed before prospective results are inspected, so that thresholds are not chosen to make results persuasive.
50. As a maintainer, I want browser tests to prove fixture isolation before research starts, so that tests cannot unexpectedly use my journal or paid providers.
51. As a maintainer, I want one documented verification entry point used locally and in CI, so that delivery checks are consistent.
52. As a maintainer, I want database tests to use explicitly configured disposable storage, so that automated checks do not depend on personal database settings.
53. As a maintainer, I want completion claims supported by application acceptance flows, so that resolved issues describe behavior users can reach.
54. As a maintainer, I want documentation to agree with application capabilities and model eligibility, so that the next contributor starts from an accurate picture.

## Implementation Decisions

- Keep the existing SvelteKit application, server-side mathematics, deterministic policy, provider adapters, and Neon journal. Extend established module boundaries rather than introducing another service.
- Preserve the separation between private lean, supplied evidence, statistical probabilities, and the policy conclusion. AI cannot choose eligibility, invent probabilities, or silently switch providers.
- Persist a versioned analysis snapshot containing the game, exact research offer, decision cutoff, evidence and source times, material gaps, manual coverage, model inputs and assumptions, artifact identity, policy version, and resulting report. Mutable schedule records support current discovery, not reconstruction of old snapshots.
- Add snapshot persistence through an additive migration. Backfill only values recoverable from existing records. Mark legacy values of uncertain provenance rather than inventing historical facts.
- Persist an analysis attempt with a stable request identifier before collection or drafting. Expose pending, running, completed, failed, and interrupted states through the existing application and store boundary.
- Enforce uniqueness for the request identifier in persistent storage. Repeating the identifier with unchanged inputs returns the existing attempt. Reusing it with different inputs produces a conflict. An explicit new refresh or deliberate rerun gets a new identifier.
- Persist completed external stages and provider attempt accounting before final report publication. Retrying finalization reuses a durable response. When a crash makes provider completion uncertain, require an explicit new attempt before sending another paid request. Do not promise exactly-once provider execution without provider support.
- Give each provider request a separate usage record. Derive totals across initial drafting and repair calls. Preserve known usage when a later call fails. Keep unreported fields unknown and indicate whether a total is partial.
- Extend the application journal interface to expose settlement, corrections, closing observations, separate summaries, export, and restore. Reuse existing repository and domain behavior where its contract matches this spec.
- Store the actual bet's complete offer snapshot independently of the research offer, with its own placement time, stake units, and submission identifier. Preserve the link to the originating analysis. Legacy bets without an independent contract retain that limitation visibly.
- Allow refreshes to change the point line, sportsbook, odds, and observation time while retaining the research market and selection. A different market or selection starts a separate research request. Every refresh preserves its parent unchanged.
- Preserve the existing primary-assessment rule of the earliest completed eligible pregame assessment per game. Freeze that choice before outcomes are used. Keep later refreshes accessible without treating them as independent primary observations.
- Record settlement and correction history as append-only events with identifiers, applicable record references, reasons, and timestamps. Apply duplicate handling and contract-specific grading. A correction changes the effective result without deleting the prior notice.
- Record closing offers as later observations. Apply the established same-market, same-side, same-line, same-book, and compatible-rule requirements for direct comparison. Display other line movement separately and mark missing comparable observations unavailable.
- Summarize primary assessments and actual bets separately. Identify settled, unresolved, void, push, and missing-data counts. State the denominator for each metric and preserve existing domain rules for refunds and unavailable results.
- Make journal backups versioned. Preserve identifiers, original timestamps, relationships, snapshots, provider accounting, primary classifications, and correction history. Exclude credentials and bulk source caches. Validate the whole import before writes, apply it atomically, and deduplicate identical records. Reject conflicting identifiers without overwriting completed history.
- Track injury coverage by team and game week. An absent player row does not establish a clean report. Accept empty coverage only when the source explicitly establishes it. Unknown team coverage remains a material gap for that team.
- Use a 24-hour maximum age for injury coverage and retain the existing 12-hour manual weather window. Apply the injury age policy to automatic retrieval and manual source times, while showing that retrieval time does not establish publication time. A material gap can be cleared only by fresh evidence scoped to that gap and team where applicable.
- Parse weather and provider payloads at their external boundaries. Source failures become visible evidence gaps. A source exception must leave the durable attempt readable and follow the existing policy's treatment of missing evidence.
- Build features from information available before the relevant decision cutoff. Generate every row in a shared kickoff group before applying that group's outcomes. Keep kickoff groups intact across chronological training and validation folds. Exclude earlier-started results when their availability before the cutoff is not established.
- Freeze model input values and starter assumptions with each prospective forecast. Record known, assumed, and unknown starter states with their evidence times. Historical actual starters without decision-time provenance do not qualify as equivalent live inputs.
- Validate artifacts and evaluation reports into named domain types before prediction or release. Reject missing, null, nonfinite, negative, or inconsistent required metrics and counts. Validate supported versions, valid probabilities, chronology, artifact identity, and complete market records. Checksum validation remains an integrity check in addition to shape validation.
- Label the reused historical holdout as development evidence and prevent it from satisfying a new independent release protocol. A prospective protocol freezes the artifact, input availability rules, eligible markets, evaluation period, sample requirements, uncertainty method, and release criteria before outcomes are inspected.
- Preserve the existing minimum of 500 priced games per released market and no-worse Brier and log loss requirements. For the new independent protocol, also require the upper endpoint of the existing slate-clustered 90% log-loss difference interval to be at most zero. Freeze these defaults before the prospective period starts. Missing independent results block release. This criterion is an experimental release condition, not proof of profitability.
- Prospective evaluation reads frozen forecasts and later observations. It does not regenerate old predictions with current schedules, starter identities, or model artifacts. Closing observations are comparison data and do not stand in for timestamped executable offers.
- Browser acceptance uses a production build with explicit test configuration, isolated journal storage, fixed inputs, and controlled provider and source responses. Assert test mode and storage identity before any submission. Remove real provider credentials from the test process and reject unexpected outbound provider calls.
- Add one documented verification entry point for format, lint, types, unit tests, production build, and isolated browser acceptance. CI also runs the shared storage contract and migrations against explicitly configured disposable database storage. Missing required integration configuration fails the required job visibly.
- Preserve valid form values on errors. Show pending state promptly, prevent accidental repeated submissions, provide market-specific inputs, and expose recovery actions. Progress comes from the persisted attempt rather than a retrospective list on the finished report.
- Update capability documentation and completion records to distinguish domain helper, persistence, and application acceptance. Record the remaining integration work without erasing the earlier implementation history.

## Testing Decisions

- The user confirmed two primary seams. The first is the application workflow, supported by the existing shared storage contract for memory and Neon. The second is the public model pipeline for fitting, evaluation, artifact loading, and release.
- Test externally observable behavior, returned failures, saved records, exported data, and outgoing provider requests. Avoid assertions about internal helper calls or private implementation order.
- Use the existing research-run, shared-store, journal integration, provider transport, model, and browser tests as prior art. Extend those contracts before adding a parallel testing framework.
- Drive a browser flow through analysis, refresh with a changed line, actual bet at a different line, settlement, correction, closing observation, separate summaries, export, and restore into isolated empty storage. Read the restored records back and compare original identities, timestamps, and relationships.
- Through the shared storage contract, save an analysis, save a later schedule with a changed kickoff and venue, and prove the earlier snapshot remains unchanged. Cover both memory and Neon, including concurrent submissions with one request identifier.
- Through the application attempt boundary, interrupt work before collection, during provider work, after response persistence, and during finalization. Verify readable attempts, stable request identifiers, preserved inputs, explicit ambiguous outcomes, and reuse of durable responses when retrying finalization.
- Supply two metered draft responses through the provider transport boundary. Verify combined usage after repair and preservation of first-attempt usage when repair fails. Verify that unknown accounting never becomes an asserted zero cost.
- Inject partial-team injury data, explicitly empty reports, stale automatic data, stale manual data, unknown source times, and malformed weather responses. Verify visible gaps and resulting policy behavior through saved analyses.
- Through public feature and evaluation inputs, change a simultaneous game's score and reorder games within a kickoff group. Verify that affected pregame predictions do not change. Verify that training folds never consume outcomes from their validation kickoff group.
- Through artifact loading and the release command, supply malformed JSON values, missing metrics, null metrics, invalid counts, unsupported versions, and artifact mismatches. Verify rejection and absence of a released output. Include valid passing and failing cases so the gate is demonstrably active.
- Verify that an inspected historical holdout cannot satisfy the independent protocol. Verify that missing or inconclusive prospective evidence blocks release and that policy changes require a new protocol identity.
- Replay a prospective forecast after changing the current model, schedule, starter information, and final score. Verify that the saved prediction and decision-time assumptions remain unchanged and only later observations affect evaluation.
- Verify primary selection, duplicate settlements, postponements, corrections, incompatible closing lines, separate assessment and actual-bet cohorts, and unavailable values through the application journal boundary. Use known expected examples rather than recomputing expected results with the implementation under test.
- Validate restore failures with malformed versions, missing relationships, and conflicting identifiers. Verify that no partial records are committed, identical imports are repeatable, and exports contain neither credentials nor bulk caches.
- Before browser actions, verify fixture configuration and test storage. Test that unexpected real-provider configuration fails before a request can be sent. Exercise unavailable and eligible model states with controlled artifacts without weakening production release criteria.
- Run browser acceptance against the production server, including form-origin handling and input retention. Keep deterministic fixture tests separate from optional live-provider experiments.
- Use explicitly configured disposable database storage in CI. Run migrations and the shared store contract there. Tests must clean up only their own isolated records or schemas.
- Give legitimate model-fitting tests an explicit execution budget. A timeout is a failed verification result, not evidence of unequal artifacts. Preserve the reproducibility assertion rather than replacing it with a weaker check.
- Completion requires passing the required verification entry point and database job, plus observable acceptance for every delivered workflow. It does not require waiting for 500 future games or obtaining a released market. Those missing results must correctly keep release blocked.

## Out of Scope

- Additional sports, live betting, new market types, or a public multi-user deployment.
- New paid data feeds, automatic bet placement, bankroll recommendations, or personalized staking.
- A distributed worker service, message broker, or general-purpose workflow platform.
- New predictive features or attempts to improve model scores before the evaluation and journal guarantees work.
- Claims of a validated betting advantage or guaranteed profitability.
- Automatic inference of historical publication times, starter knowledge, actual bet lines, or other facts that the saved record cannot establish.
- Rewriting the application framework, replacing Neon, or reorganizing modules solely for stylistic consistency.
- Changing provider selection through silent fallback or broadening AI authority over mathematical results and policy conclusions.
- Destructive cleanup of existing research, deployment, or migration execution as part of publishing this spec.

## Further Notes

This spec synthesizes the project review and the user's approval of the proposed test seams. It authorizes a concrete implementation scope, not a claim that its features already exist.

At review time, format, lint, type checks, production build, 241 unit tests on rerun, and 14 database integration tests passed. The initial unit run had one reproducibility timeout. Browser acceptance finished with one pass and two failures, including a configured provider appearing where the fixture drafter was expected. The configuration cause remains unconfirmed and must be reproduced before a fix is selected.

The prior review directly reproduced concurrent-outcome feature leakage and acceptance of null release metrics. Shared-game snapshot mutation was established by tracing the persistence and readback paths. Add behavioral regressions for each rather than treating the review narrative as sufficient proof of remediation.

Deliver the work in verifiable increments. First establish isolated verification and correct snapshot, boundary, and evaluation behavior. Then add durable attempts, provider accounting, and evidence coverage. Complete the actual-bet, settlement, closing, summary, and recovery workflow before prospective evaluation integration. Preserve the original journal throughout.

The new 90% interval release criterion is a specified default for the independent protocol. Its adequacy remains a research question. It must not be tuned against the prospective outcomes it governs.

Experience First puts complete journal use ahead of expansion. Type System Discipline places parsing at external boundaries. Test Behavior, Not Implementation keeps regressions at the user and public pipeline interfaces. These principles guide implementation choices without requiring a new application architecture.
