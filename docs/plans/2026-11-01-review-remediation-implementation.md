# Review remediation implementation plan

> Execute this plan task by task with `superpowers:executing-plans`. It authorizes no live migration, paid request, deployment, artifact replacement, or market release.

**Goal:** Repair the confirmed review findings while preserving saved journal facts and the frozen release protocol.

**Architecture:** Extend the existing `JournalStore`, use one canonical v1 backup, keep anchor prices distinct from executable offers, and complete boards before separate explanation attempts. Model revisions and prospective research follow the storage and workflow repairs.

**Tech stack:** SvelteKit, Svelte, TypeScript, Node 24, Vite+, Vitest, Playwright, and PostgreSQL through the current Neon adapter.

Status: all 16 tasks are delivered. Application and disposable-database verification passed on 2026-11-01. Tasks that require production refitting, registration, or new research remain explicitly unactivated. The [architecture](2026-11-01-review-remediation-architecture.md) defines the interfaces, compatibility rules, and rationale. The [validated findings](../research/2026-11-01-review-validation.md) remain the original evidence record.

## Delivery rules

Read `docs/testing.md` before verification and `DESIGN.md` before UI changes. Use the existing worktree's own dependencies. Keep work in small commits that each pass their focused checks. Do not add all regression tests in one commit and leave unrelated failures for later tasks.

For each task:

1. Add the behavioral regression beside the affected public interface. Run its focused suite and confirm the expected failure.
2. Implement the smallest complete slice, migrating its callers and deleting obsolete internal write paths together.
3. Run that focused suite again. Inspect actual saved records, returned failures, exports, or outgoing requests.
4. Run `npm run verify` for a deliverable application slice. Storage changes additionally require `TEST_DATABASE_URL=... npm run verify:database` against explicitly disposable storage.
5. Record the command, result, and remaining limits in the task's delivery record. Commit only the completed slice.

Never read `.env` for verification, fall back to `DATABASE_URL`, or treat fixture-memory browser acceptance as proof of Neon behavior. A missing disposable database blocks claiming storage verification, not writing or reviewing the change. No application tests are claimed as passed merely because this document formats successfully.

Task file lists name existing owners and proposed files. New migrations use the next free number after 024 at execution time. Type and function sketches belong to the architecture document; they are not production stubs to be committed before use.

## Dependency and delivery map

| Task                                             | Depends on     | Delivery                             |
| ------------------------------------------------ | -------------- | ------------------------------------ |
| 01. Complete Neon backups                        | None           | Integrity repair                     |
| 02. Canonical memory compatibility               | 01             | Integrity repair                     |
| 03. Primary serialization and SQL protections    | 02             | Integrity repair                     |
| 04. Explicit anchor and executable pricing       | 02             | Decision repair                      |
| 05. One forecast and complete analysis inputs    | 04             | Decision repair                      |
| 06. Forecast-first boards and exclusive drafting | 03, 05         | Decision repair                      |
| 07. Fetch, secret boundaries, and refit safety   | None           | Independent runtime repair           |
| 08. Native forms and explicit entry time         | 05             | Workflow repair                      |
| 09. Theme and confirmed design corrections       | None           | Independent UI repair                |
| 10. Verification coverage and tooling types      | 02, 06, 08, 09 | Required verification coverage       |
| 11. Shared-secret LAN sessions                   | 07, 08         | Optional deployment capability       |
| 12. Corrected model inputs and ablation          | 05, 07, 10     | New artifact, explicit activation    |
| 13. Stable release authorization                 | 02, 06         | Required before first release        |
| 14. Probability-matched anchor revision          | 12             | Measured model revision              |
| 15. Batched queries and journal workflows        | 02, 03, 06, 10 | Query repair, then optional features |
| 16. Additional evidence and evaluation research  | 12, 15         | Research only                        |

Tasks 01 through 10 establish the corrected application. Task 13 is needed before the first release, independently of whether the forecasting algorithm changes. Tasks 12 and 14 need refit and registration before activation. Task 16 cannot authorize release under a successor protocol without an explicit change to project policy.

## Task 01. Preserve all Neon backup records

**Files:** Modify `src/lib/server/analysis/neon-board-store.ts`, `neon-store.ts`, `src/lib/server/db/repository.ts`, `scripts/journal/export.ts`, and `src/routes/journal/export/+server.ts`. Create `src/lib/server/analysis/journal-backup.ts`. Extend `tests/board-store-contract.ts`, `tests/pick-bet-contract.ts`, `tests/integration/journal.test.ts`, and `tests/integration/neon-store.test.ts`.

1. Add a mixed-record fixture containing board quotes, a placed pick bet with its own contract, and bet-only settlement/correction notices. Assert records survive read, export, restore, and readback. The current SQL reader returns empty quotes and the export omits bet-only notices.
2. Move canonical v1 wire types, graph validation, and semantic equality into the backup owner. Keep existing public collection names and old optional-list defaults. Have the repository import those definitions rather than defining a competing format.
3. Include quotes in normal reads and restore inserts. Export every notice subject, including bet-only notices, and validate actual relationships rather than requiring every notice to name an analysis.
4. Make complete Neon export collect repository and board data under one consistent read snapshot. Keep SQL fragments internal. Both CLI and HTTP use the complete store and the same codec. Align CLI TLS behavior with `db/client.ts`.
5. Write CLI output exclusively to a new file only after full graph validation. Do not overwrite an earlier backup. Compare records semantically rather than through JSON key order.

**Acceptance:** A board-only journal and a journal containing pick-dependent bets/notices both export valid restorable files. Reordered nested JSON restores idempotently. An actual changed value conflicts and leaves the destination unchanged. CLI tests use temporary files and isolated storage, not the user's database.

**Focused checks:** `./node_modules/.bin/vp test run tests/integration/journal.test.ts tests/integration/neon-store.test.ts --testTimeout=30000 --hookTimeout=30000` with explicit disposable `TEST_DATABASE_URL`. Finish with the documented full database check.

## Task 02. Make version 1 portable between stores

**Files:** Modify `src/lib/server/analysis/store.ts`, `board-store.ts`, `neon-store.ts`, `journal-backup.ts`, and repository restore. Create `src/lib/server/analysis/journal-backup.test.ts` and `tests/journal-backup-contract.ts`. Add an internal legacy-memory decoder only if it needs a separate implementation file. Extend the integration journal suite and `docs/testing.md`.

1. Assert memory to Neon to memory and Neon to memory to Neon preserve the complete canonical graph, including failed/interrupted attempts and unknown accounting. Current memory exports empty normalized arrays and requires private `runs` on import.
2. Give memory stable technical record IDs at creation. Retain imported IDs. Normalize recognized old memory-v1 layouts using deterministic technical IDs only where missing storage surrogates require them.
3. Implement input-only legacy decoding. Reject mixed incompatible layouts, malformed extensions, missing references, correction cycles, and conflicting IDs without partial writes. Emit only canonical v1 from both stores.
4. Stage memory restoration before swapping maps. Restore SQL in one transaction and in FK dependency order, beginning with registrations. Preserve historical classifications and timestamps exactly.
5. Add the new-format metadata extension points needed by tasks 04 and 06 without accepting unknown future versions silently. Keep pending/ambiguous records inert during restore.

**Acceptance:** Identical imports add no duplicates. One malformed record or destination conflict changes no records in either adapter. Legacy normalized v1 without boards and recognized memory-v1 both restore. No provider or source request occurs during import.

**Focused checks:** `./node_modules/.bin/vp test run src/lib/server/analysis/journal-backup.test.ts src/lib/server/analysis/store.test.ts src/lib/server/analysis/recovery.test.ts`, followed by the shared contract in disposable PostgreSQL.

## Task 03. Serialize primary assignment and enforce frozen SQL records

**Files:** Modify `src/lib/server/db/repository.ts`, `analysis/neon-board-store.ts`, `store.ts`, `primary.ts`, and relevant board primary logic. Create an additive integrity migration. Extend `src/lib/server/analysis/primary.test.ts`, `tests/board-store-contract.ts`, and integration journal/store tests.

1. Add distinct-submission concurrency tests for the same game. Both completions must return readable records, with exactly one primary. Also test different games and a refresh of an unclassified parent.
2. Converge all completion writers on game-row locking before subject-row locking. Obtain completion time after serialization. Preserve unique primary indexes and idempotent repeated completion.
3. Carry parent identity into assessment classification and reject refresh promotion without reclassifying history. Query the primary predicate where only the primary is required.
4. Add append-only triggers for registrations and closing snapshots. Validate references before adding the restrictive board-registration FK. Ship registration-first restore with that constraint.
5. Assert database update/delete rejection, valid new inserts, and unchanged restore behavior. Invalid old references fail visibly with IDs; the migration does not repair facts automatically.

**Acceptance:** Concurrent first completions do not surface a unique-index race or strand the losing attempt. One game remains one primary per cohort. Existing frozen records are untouched. Locks enclose no provider or source work.

**Focused checks:** `./node_modules/.bin/vp test run src/lib/server/analysis/primary.test.ts`, then `TEST_DATABASE_URL=... npm run verify:database`.

## Task 04. Separate the anchor from executable prices

**Files:** Modify `src/lib/domain/board.ts`, `analysis/model-pick.ts`, `board-run.ts`, `board-store.ts`, `neon-board-store.ts`, and the backup codec. Create `src/lib/domain/board.test.ts` and an additive pricing-metadata migration. Extend `tests/e2e/line-shopping.spec.ts` and shared board contracts.

1. Add regressions for home/away spreads of both signs, totals, moneylines, worse extras, ties, different lines/rules, shopped timestamps, and same-book fair probabilities.
2. Parse a typed anchor pair and quote extras. Select executable offers against the correct side's contract, including anchor prices in the ranking. Preserve chosen observation times.
3. Pass anchor fair probabilities/hold and executable offers distinctly to pick calculation. Version changed pick calculations. Preserve old saved calculations.
4. Persist explicit paired anchors and a pricing-format discriminator for new markets. Update all store readers, graph validation, export, and restore together.
5. Migrate consumers off implicit anchor reconstruction for new writes. Legacy read recovery uses only proven saved data and shows unavailable when ambiguous.

**Acceptance:** Away +3.5 accepts only that away line, spread/total shops actually affect execution and EV, and a shop never changes the anchor's no-vig probability. Memory and PostgreSQL retain the paired anchors and all quotes after restore.

**Focused checks:** `./node_modules/.bin/vp test run src/lib/domain/board.test.ts src/lib/server/analysis/board-run.test.ts`, then isolated browser shopping acceptance and database verification.

## Task 05. Forecast once from complete evidence and paired prices

**Files:** Modify `analysis/model.ts`, `run.ts`, `board-run.ts`, `board-store.ts`, `forecast-record.ts`, `form.ts`, root and analysis-refresh page/server files, `src/routes/board/+page.server.ts`, relevant model forecast modules, and fixture factories. Extend analysis/run/model/board-run tests, `tests/e2e/research-flow.spec.ts`, and `tests/e2e/prospective-capture.spec.ts`. Update README capability text.

1. Assert that analysis and board grading probabilities equal their saved forecasts and that gathered evidence reaches the frozen inputs. Add a valid paired-price research submission and unavailable-opposing-price case.
2. Introduce the named forecast request and migrate model/forecast callers in the same increment. Derive policy projection from the frozen result; remove the duplicate internal computation path.
3. Add opposing-price entry through request type, parser, form, refresh, and snapshot. Validate the same-book pair and observation times. Preserve selected market/side on refresh.
4. Return a visible unavailable reason for incomplete inputs. Align README and form copy with that behavior without inventing a fallback probability.
5. Resolve and pin the artifact and selected registration before `beginBoard`. Validate checksum, input-availability version, registration/cutoff chronology, period, and entered markets. Return a typed field rejection without creating a board for incompatible input. Keep store registration validation and put expected begin failures inside workflow error handling. Valid current registrations include all three markets; test malformed/subset registrations as defensive cases without expanding the frozen protocol.

**Acceptance:** The reachable root workflow captures a real fixture forecast when the paired quote is valid. It retains the unreleased policy conclusion. Evidence and forecast identity remain unchanged after later schedule updates. A mismatched registration returns a useful 400 response with no new board or provider request; an expected store registration rejection cannot escape as an HTTP 500. Execution failures after durable begin remain readable.

**Focused checks:** `./node_modules/.bin/vp test run src/lib/server/analysis/run.test.ts src/lib/server/analysis/model.test.ts tests/model/prospective-forecast.test.ts`, followed by production-browser analysis/refresh acceptance.

## Task 06. Complete forecasts independently of exclusive explanation attempts

**Files:** Modify `analysis/board-run.ts`, `board-store.ts`, `neon-board-store.ts`, `pick-explanation.ts`, relevant providers, board page projection/rendering, backup codec, and `analysis/prospective-sample.ts` only where type adaptation is necessary. Add an explanation-event migration and an ADR clarifying 0005. Extend board-run/explanation, `tests/providers/pick-explanation.test.ts`, provider transport, prospective-journal, integration, and browser tests.

1. Add failures and contradictions after valid computation. Assert the primary and frozen forecast remain eligible, while explanation failure is visible. Assert historical failed boards remain excluded.
2. Implement `completeBoardForecast` with atomic markets, evidence, completion, and role assignment under task 03's locks. Commit before explanation. Keep the terminal-board immutability trigger.
3. Store new explanation events separately. Add lifecycle-format read dispatch and canonical backup coverage. Retire the old new-board freeze-then-finish path and inline provider writes together.
4. Implement exclusive start/request reservations. Two concurrent workers for the same original or repair request can produce at most one outgoing request. Persist each request intent and response around actual transport, not only after the entire draft/repair function returns.
5. Exercise interruption before commit, after commit, after request reservation, after durable response, and during repair. Reuse proven responses. Mark unproven outcomes ambiguous and require deliberate new paid attempts.
6. Compare legacy prospective inclusion/exclusion before and after the change. Do not add a predicate that accepts failed boards merely because they contain picks.
7. Replace the blanket prose digit ban with contextual entity and controlled football-vocabulary handling. Accept `49ers`, `QB1`, and ordinary down terminology, while still rejecting invented odds, lines, percentages, unsupported game-week facts, and unresolved evidence references. Test both acceptance and continued rejection through the actual explanation validator and provider repair path.

**Acceptance:** Draft success, failure, contradiction, or interruption cannot change a completed forecast's side, numbers, grade, role, or freeze time. A crash cannot produce duplicate paid execution on recovery. No historical completion is backfilled.

**Focused checks:** `./node_modules/.bin/vp test run src/lib/server/analysis/board-run.test.ts src/lib/server/analysis/board-explanation.test.ts tests/providers/pick-explanation.test.ts tests/providers/transport.test.ts tests/model/prospective-journal.test.ts`, followed by application and database gates.

## Task 07. Bound runtime failures and make replacement deliberate

**Files:** Modify `sources/fetch.ts`, `analysis/redact.ts`, settings server/store paths, relevant provider error handling, `scripts/model/refit.ts`, and export boundary handling. Extend source, redaction, settings, model command, and provider transport tests. Add a focused fetch test file if needed.

1. Assert an abort-ignoring slow body cannot return success after the deadline. Wrap complete body consumption in the same bounded operation and observe late rejections safely. Preserve existing malformed-JSON gap behavior.
2. Sanitize error text before storing model tests and before rendering old tests. Remove exact configured secrets and credential-bearing diagnostics. Assert saved values and responses using dummy credentials.
3. Structurally exclude settings/credentials from backups and reject known-secret-containing immutable content with record paths. Do not silently rewrite saved payloads during export.
4. Require an explicit source path for refit replacement. Test the real command with temporary input/output files; missing input must exit nonzero without changing an existing artifact. Synthetic fitting must be explicit. Do not run replacement against `data/artifacts/baseline.json` during verification.

**Acceptance:** Late bodies return timeout failures, stored errors omit dummy secrets, malformed NWS JSON still yields a gap, and missing refit input cannot replace a model.

**Focused checks:** `./node_modules/.bin/vp test run tests/sources/nws.test.ts tests/sources/downloads.test.ts src/lib/server/analysis/redact.test.ts src/lib/server/settings/store.test.ts tests/providers/transport.test.ts tests/model/ablation.test.ts` plus any new focused fetch/command file.

## Task 08. Use native forms with an explicit timezone

**Files:** Modify journal page/server, root and refresh forms, board forms where shared behavior applies, `analysis/form.ts`, and `src/lib/format.ts`. Create `src/lib/time.ts` and focused time tests. Extend `tests/e2e/research-flow.spec.ts` and journal acceptance.

1. Assert each action renders exactly one correctly located result. A bet success cannot display a closing success. Settlement failures appear within settlement.
2. Use action-discriminated results and field errors. Replace refresh display/hidden copies and delayed submission with correctly named native inputs. Preserve values on failure and accessible pending behavior.
3. Parse and format entry times in the declared Eastern zone. Run date-boundary tests under UTC and America/New_York server environments. Cover nonexistent and ambiguous DST times with explicit resolution.
4. Validate closing input before ISO formatting and return a helpful field failure. Exercise forms before hydration or with JavaScript disabled, then browser Back and resubmission.

**Acceptance:** Edited refresh terms post correctly without JavaScript. Server `TZ` does not alter the saved instant. Invalid dates produce scoped errors, and Back does not leave a permanently disabled form.

**Focused checks:** `./node_modules/.bin/vp test run src/lib/server/analysis/form.test.ts src/lib/time.test.ts`, followed by the production-browser scenarios. Existing saved timestamps remain unchanged.

## Task 09. Repair theme state and confirmed design drift

**Files:** Modify `src/lib/components/app/theme-switch.svelte`, board/journal page markup, `src/app.css`, and the button variant call site. Reuse authoritative feature metadata. Extend existing browser assertions where behavior needs coverage.

1. Update selected theme reactively and assert changed `aria-checked` immediately after clicking, before reload. Keep server-applied cookie behavior.
2. Give unknown markers one source, use complete typed feature labels, and set the board's primary action variant explicitly.
3. Correct ink hover semantics and ungated raw CSS. Account for Tailwind's existing hover gate rather than adding redundant wrappers.
4. Inspect 390px production pages in both themes. Fix measured checksum overflow while keeping the full identifier accessible. Preserve labels, focus, reduced-motion behavior, and existing test IDs.

**Acceptance:** Radio selection and applied theme agree immediately. Missing values show one symbol, feature names are readable, and the inspected phone pages have no horizontal page overflow. Simple style corrections do not need implementation-mirroring unit tests.

**Focused check:** Build and run the affected production-browser scenarios through `npm run verify`.

## Task 10. Check tooling types and isolate verification state

**Files:** Modify `tsconfig.json`, `package.json`, relevant verification runner/environment configuration, and browser setup. Create a dedicated tooling/test TypeScript config. Extend verification isolation tests and affected browser specs.

1. Include every intended `scripts/**/*.ts` and test TypeScript root in explicit typechecking. Keep Svelte-generated type handling in the application config. Fix actual type errors rather than widening them away.
2. Wire the additional check into the existing application verification command and clean subprocess environment.
3. Reset the fixture journal at each independent browser scenario. Preserve state intentionally within recovery flows. Assert the journal identity before mutation.
4. Replace `networkidle` as the completion condition where an actual saved-state or accessible UI assertion exists. Replace `.first()` error assertions with exact scoped counts.
5. Run fixtures for no-JavaScript forms, immediate theme accessibility, exclusive provider reservations, and PostgreSQL round trips at their actual interfaces.

**Acceptance:** A type error in a script or an otherwise-unimported test fails the required check. Independent browser scenarios do not depend on order or prior journal contents. Fixture mode remains credential-free with outbound requests blocked.

**Focused checks:** `npm run check`, verification isolation tests, then `npm run verify`.

## Task 11. Protect deliberate LAN use

**Files:** Create `src/lib/server/access.ts` and login/logout routes. Modify `src/hooks.server.ts`, `src/lib/server/listen.ts`, `scripts/start.ts`, configuration, verification environment allowlists, `.env.example`, README, and `docs/testing.md`. Extend launcher, access, and production-browser network tests.

1. Define configuration for an optional high-entropy shared secret and explicit non-loopback policy. Document the transition from the current no-login LAN mode before changing startup enforcement.
2. Gate every protected page/data/action/export route in the server hook. Exchange the secret for a signed expiring HttpOnly SameSite session. Enforce constant-time checks, bounded login attempts, expiry, and logout.
3. Keep Host and origin protections. Test direct download and action URLs so bypassing the page UI grants no access. Never persist the configured secret in the journal or backup.
4. Test loopback defaults, authenticated LAN access, denied unauthenticated requests, TLS cookie behavior, and plain-HTTP limitations. Keep `/__verification` fixture-only and cover its behavior under this gate explicitly.

**Acceptance:** An unauthenticated LAN client cannot read/export/restore the journal or trigger provider work. Access control does not claim transport encryption or add multi-user accounts.

**Focused checks:** Access/launcher suites, then `npm run verify` with dummy secrets only.

## Task 12. Correct model inputs under a new fitted identity

**Files:** Modify `sources/play-by-play.ts`, `models/predict.ts`, `models/training-code.ts`, relevant training identity pins, model/input parsers if their format changes, model fixture generation, and evaluation documentation. Extend source, efficiency, chronology, ablation, and training-code tests.

1. Assert PROE on mixed pass/run values and efficiency on scrimmage plays with special teams, kneels, and spikes present. Declare the eligible sample and denominators, including dropback/scramble treatment and available values.
2. Correct aggregation and bump the on-disk summary-cache version. Old summaries must be rejected even when source size and modification time are unchanged.
3. Fix ablation centering using each model's own means. Verify with deliberately different means. Keep era normalization and garbage-time selection separate experiments.
4. Bump training/input semantics. Refuse incompatible old live artifacts with a refit-required reason while retaining their saved forecasts. Refit synthetic browser fixtures explicitly, update their pinned identity, and pass all chronology/reproducibility checks.
5. Produce any real candidate at a new path using explicit source inputs. Do not replace the model in use or register a production artifact as part of automated verification. Record the candidate identity and prospective registration requirement.

**Acceptance:** Corrected features cannot run silently behind an old model identity. Fixtures demonstrate the new semantics; frozen old probabilities and original registration times remain unchanged. Model quality improvement is not assumed from the correctness fix.

**Focused checks:** `./node_modules/.bin/vp test run tests/sources/play-by-play.test.ts tests/model/efficiency-features.test.ts tests/model/chronology.test.ts tests/model/ablation.test.ts tests/model/training-code.test.ts`, then full verification with explicit fixture repinning.

## Task 13. Separate release authorization from predictor identity

**Files:** Modify `models/artifact.ts`, `models/release.ts`, `analysis/model.ts`, deployment configuration, `scripts/model/release.ts`, frozen eligibility metadata, and release/input/command tests. Add an ADR extending 0004. Add backup persistence only if attestations become journal records.

1. Assert that releasing moneyline leaves the exact registered predictor bytes/checksum unchanged and permits later spread/total forecasts under their existing valid binding.
2. Produce a separate immutable release attestation bound to predictor checksum, market, registration, protocol, and evidence identity. Preserve the legacy checksum algorithm.
3. Include or resolve a complete local source-evidence bundle. Recompute the qualified sample and release gate on creation and verification. Reject altered verdicts, incomplete evidence, or a different predictor. A matching hash alone does not prove release.
4. Make runtime eligibility consume a verified attestation separately from the predictor. Freeze eligibility and attestation identity alongside each future forecast. Cache only by verified immutable inputs.
5. Update CLI usage and deployment docs. Synthetic passing samples verify the mechanism; no actual market is released by this task.

**Acceptance:** One market's authorization cannot change forecast identity or disrupt another market's registration. Existing saved release fields remain historical data. The only permitted release criteria remain `prospective-2026-10-26`.

**Focused checks:** `./node_modules/.bin/vp test run tests/model/release.test.ts tests/model/prospective-command.test.ts tests/model/prospective-journal.test.ts tests/model/input-boundaries.test.ts`, plus command tests for immutable predictor preservation.

## Task 14. Validate probability-matched anchors before activation

**Files:** Modify `models/anchor.ts`, `distribution.ts`, `train.ts`, `forecast.ts`, calibration/evaluation callers, and artifact/training identities only after the experiment passes its correctness criteria. Extend anchor, parity, key-number, residual, and chronology tests. Add a successor ADR to 0003.

1. Record zero-adjustment behavior across half-point and integer lines using a fixed artifact. Include the reproduced total asymmetry and shaded two-sided spread prices.
2. Implement a bounded root solve against the final discrete decisive probability. Verify key-weight monotonicity, bracket handling, probability tolerance, and explicit moneyline tie rules. An infeasible target returns unavailable.
3. Use the same versioned mapping for training, calibration, historical evaluation, and live forecasting. Verify zero adjustment reproduces the entered anchor probability within the declared tolerance.
4. Compare chronological development results without tuning against prospective outcomes. Keep the inspected holdout labeled development evidence. Record adverse calibration changes as well as gains.
5. Refit to a new path and require an actual prospective registration before activation. Do not regenerate saved forecasts or change v1 release rules.

**Acceptance:** The corrected anchor matches its own two-sided book at zero adjustment, including integer push mass handling. Passing that property establishes anchor consistency, not profitability or release.

**Focused checks:** `./node_modules/.bin/vp test run tests/model/anchor.test.ts tests/model/anchored-parity.test.ts tests/model/key-numbers.test.ts tests/model/residuals.test.ts tests/model/calibration-chronology.test.ts`, then full model/application verification.

## Task 15. Batch reads, then improve journal workflows

**Files:** Modify Neon/repository list readers, `analysis/summary.ts`, closing/performance projections, journal and board-performance routes, board settlement forms, and shared store interfaces as needed. Extend integration, summary, closing, settlement, and browser tests.

1. Batch related board records and eliminate repeated full hydration. Return early for empty closing references. Inspect representative query plans before adding indexes. Verify results first; report latency only after a representative measurement.
2. Add descriptive aggregate raw price movement and separately named two-sided no-vig/calibration metrics. Use only saved forecasts and qualified later observations. Display distinct cohorts and unavailable denominators.
3. Add sourced schedule-result prefill with explicit confirmation. Append notices through the existing subject-specific operations. Preserve placed-contract grading and correction history.
4. Replace raw correction IDs with a notice selector. Add stable cursor pagination and season/week grouping if volume warrants, with complete export independent of pagination.

**Acceptance:** Existing results and record identities survive batching. Reporting never merges research, model picks, and actual-bet denominators. Prefill creates no notice before confirmation. Pagination cannot omit records from backups.

**Focused checks:** Summary/closing/store tests, disposable-database integration, then journal/performance/settlement production-browser acceptance.

## Task 16. Keep evidence and evaluation extensions explicit research

**Files:** Research notes first. A selected project spec belongs under `.scratch/<feature>/spec.md` after reading issue-tracker guidance. Do not wire unused injury or weather helpers directly into live forecasts.

1. Specify structured manual QB evidence with player/team/position, designation, source time, and override semantics. Keep private lean out of those inputs.
2. Assess non-QB publication-time and snap-count coverage before a fitted feature proposal. Evaluate era baselines, garbage-time definitions, weather interactions, and de-vig variants separately using chronological development evidence.
3. Add descriptive independent push calibration without changing the current relative-loss comparator.
4. Design moved-line reference comparisons only with alternate prices or a validated distribution model. Label inferred values distinctly from observed comparable closes.
5. Draft any successor evaluation protocol before its observations and preserve v1 results. It cannot release a market under the current project instructions.

**Acceptance:** Each proposal states provenance, eligible sample, comparison, exclusions, and activation conditions. No speculative feature silently changes live forecasts or a frozen protocol.

## Findings disposition

| Validated finding group                                                                                   | Implementation owner                                                                                            |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Quotes, CLI omissions, bet-only notices, restore equality                                                 | 01                                                                                                              |
| Memory/Neon incompatibility and whole-file atomicity                                                      | 02                                                                                                              |
| Concurrent primaries, refresh promotion, missing SQL protections                                          | 03                                                                                                              |
| Spread/total shops, away-line sign, badges, cross-book display, quote times                               | 04                                                                                                              |
| Missing opposing input, evidence propagation, and registration preflight                                  | 05                                                                                                              |
| Draft-dependent eligibility, digit-ban precision, interruption, duplicate paid execution                  | 06                                                                                                              |
| Body deadline, secret-error boundaries, unsafe synthetic refit default                                    | 07                                                                                                              |
| Form collisions, bad-date responses, stale refresh values, timezone                                       | 08                                                                                                              |
| Theme state, duplicate marks, feature labels, button/hover/overflow                                       | 09                                                                                                              |
| Tooling type coverage and browser-state blind spots                                                       | 10                                                                                                              |
| Reachable unauthenticated LAN actions                                                                     | 11                                                                                                              |
| PROE/play sample/cache identity and per-model means                                                       | 12                                                                                                              |
| Release metadata changing registered identity                                                             | 13                                                                                                              |
| Totals asymmetry, vig shading, fixed-grid inversion                                                       | 14                                                                                                              |
| N+1 reads, CLV/calibration presentation, settlement assistance, navigation                                | 15                                                                                                              |
| Era/injury/weather/de-vig hypotheses, independent pushes, moved-line protocol                             | 16                                                                                                              |
| Claimed NWS malformed-JSON exception and unhandled timeout rejection                                      | No fix for the disproven mechanisms. Preserve JSON-gap coverage and repair only the actual body deadline in 07. |
| Claimed full-table row locks, universal backup conflicts, proven leaks, or proven profitable improvements | No implementation assumption. Retain the qualifications in the assessment.                                      |

## Design comparison record

Two independent candidates compared extending `JournalStore` against introducing aggregate command facades and additional completion milestones. The read-only judge preferred the existing-store design. Scores are comparative judgments, not measured quality metrics.

| Criterion, scored from 0 to 5                | Candidate A | Candidate B |
| -------------------------------------------- | ----------- | ----------- |
| Preserve invariants, protocol, and history   | 4           | 4           |
| One owner and small caller interface         | 5           | 3           |
| Crash, concurrency, and backup completeness  | 4           | 4           |
| Incremental delivery and verification        | 4           | 4           |
| Finding coverage and explicit research gates | 5           | 5           |

The synthesis takes A's store ownership and completed computational board, B's explicit legacy/crash discipline, and the judge's exclusive request reservation. It rejects a generic event store, a second journal facade, a failed-board exception in v1 evaluation, and a new v6 checksum algorithm. Separate evidence-verified release authorization preserves the exact predictor identity. External model families were unavailable, so all agents used the available inherited model; this is not cross-model validation.

## Completion record

The decision trail is `.audit/review-remediation.tsv`. Earlier committed work and its verification are retained there. Final integrated logs use the `remediation-` prefix under the executing session's scratch directory. A focused success below does not replace the required application and database gates.

| Task | Delivered behavior                                                                                                                                                    | Evidence and limits                                                                                                                                                                                                                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01   | Complete read-snapshot Neon export, quotes, bet-only notices, exclusive CLI output, semantic restore equality.                                                        | `d8f665f`, subsequent portability and lifecycle integration. Initial integrated database run passed export and restore scenarios.                                                                                                                                                                           |
| 02   | Canonical portable version 1, input-only legacy decoding, staged memory restore and transactional SQL restore.                                                        | `a7c093a`. Shared mixed-graph and failed/ambiguous explanation round trips pass through both adapters. Orphan event histories remain rejected.                                                                                                                                                              |
| 03   | Game-row primary serialization, parent-aware classification, immutable registrations and closing snapshots.                                                           | `6d6d07c`. The corrected pre-025 fixture includes independent 026 and 027 schema additions. All six integrity tests pass, including concurrent completions and unchanged dangling references after rejected migration.                                                                                      |
| 04   | Explicit paired anchor, independently selected executable prices, preserved selected quote times, and migration 026.                                                  | `a25428a`, focused 59 and 108 compatibility tests. That commit also captured an in-progress task 05 delta and was not a verified standalone application slice. Final acceptance covers the combined implementation.                                                                                         |
| 05   | Named evidence-aware forecast request, one frozen calculation for policy and record, paired research and refresh fields, artifact pinning and registration preflight. | Model/run and production paired-price capture scenarios pass. Missing opposing prices remain unavailable. Invalid registrations create no board.                                                                                                                                                            |
| 06   | Atomic completed forecast before drafting, append-only exclusive original and repair events, durable responses, deliberate retry, and separate failure display.       | Migration 027 and ADR 0006. Workflow 54 and explanation 25 focused tests pass. PostgreSQL lifecycle concurrency and cross-store event round trips pass. Legacy failed boards remain excluded.                                                                                                               |
| 07   | Bounded response-body collection, redacted configured-secret failures, and explicit refit inputs.                                                                     | `61b458a`. Provider and boundary integration passed 67 tests. No live provider request was used for verification.                                                                                                                                                                                           |
| 08   | Native refresh inputs, action-scoped journal results, explicit Eastern conversion, DST rejection and resolution.                                                      | Time/form tests passed 17 under UTC and 17 under America/New_York. Native scoped failures, protocol success, invalid dates, and Back to the original GET form pass. Native paired refresh is included in final acceptance.                                                                                  |
| 09   | Immediate reactive theme selection, typed feature labels, semantic marks and hovers, and phone overflow fixes.                                                        | `35972b0`. Production theme and 390px scenarios pass. Full identifiers remain accessible.                                                                                                                                                                                                                   |
| 10   | Explicit tooling typecheck, app-owned generated-route test coverage, identity-checked scenario reset, and saved-state readiness assertions.                           | Real previously unchecked fixture errors were corrected without disabling strictness or excluding test roots from all checks. Standalone tooling compilation passes.                                                                                                                                        |
| 11   | Optional high-entropy secret, signed expiring session, bounded login attempts, consistent read/action/export gate, and explicit unsafe LAN opt-in.                    | Protected production launcher scenario passes. Legacy no-login host/origin scenarios explicitly opt into unsafe LAN access. HTTP still provides no confidentiality.                                                                                                                                         |
| 12   | Scrimmage-v2 sample and separate available-value denominators, PROE over available eligible plays, cache v2, and per-model ablation means.                            | Artifact v7, `training-2026-11-01`. Only the named synthetic browser fixture was refitted. Old live artifacts require refitting. Historical saved forecasts are untouched.                                                                                                                                  |
| 13   | Immutable separate release attestation, complete local evidence verification and gate recomputation, runtime verified capability, and frozen attestation checksum.    | ADR 0007 and command tests preserve exact predictor bytes. Synthetic evidence tests cannot release any production market.                                                                                                                                                                                   |
| 14   | Bounded probability-matched final discrete anchors shared by training, calibration, evaluation, and live forecasts.                                                   | ADR 0008, uncertainty 14 and anchor/chronology 22 focused tests pass. Duplicate kernel evaluations are removed while repeated sorted addition preserves exact rounding and fixture identity. The [development diagnostic](../research/2026-11-01-model-input-anchor-experiment.md) is not release evidence. |
| 15   | Batched related board reads, reference-bounded closing reads, separate descriptive cohorts, sourced-result confirmation, and saved-notice selectors.                  | Query-count and result-identity tests pass. No latency claim or new index is made. Cursor pagination and extra grouping were not added because representative volume did not establish a need.                                                                                                              |
| 16   | Nine scoped evidence and evaluation proposals with provenance, samples, comparisons, exclusions, and activation gates.                                                | `0d31293`, [research note](../research/2026-11-01-evidence-evaluation-extensions.md), and `.scratch/evidence-evaluation-extensions/spec.md`. No speculative feature or successor protocol is activated.                                                                                                     |

### Final verification

- `npm run verify` passed on the stabilized tree: 370 formatted files, no lint warnings or errors, application and tooling types, 783 unit tests, three isolated density-grid tests, production build, and 45 isolated production-browser scenarios. Log: `remediation-verify-complete.log`.
- `TEST_DATABASE_URL='postgresql://nochaserz@127.0.0.1:55439/pocketcheck_test?sslmode=disable' npm run verify:database` passed all 145 tests in eight files. The server is disposable PostgreSQL 16 under the session scratch directory, not the user's Neon journal. Log: `remediation-database-verified.log`.
- The first final browser run passed 44 of 45 scenarios. Its failure identified missing refresh pending and duplicate-click behavior. The repair uses the native submit event and resets on browser `pageshow`, without hidden input copies, a delayed submit, or dependence on JavaScript for edited terms.
- The successful application command was initially chained to database verification. The outer tool enforced a 600-second ceiling during the database phase. The database command was then rerun independently and exited successfully. The interruption is not reported as a storage test failure or a completed storage run.
- Final review found that batched pick-contract lookup still used the anchor board's sportsbook and observation time. A SQL regression reproduced the mismatch. The reader now uses the saved executable offer, and the complete database gate includes that regression.
- Local document targets and `git diff --check` passed. No test time limit, strict typecheck, chronology predicate, or release criterion was relaxed for the final gates.

No live migration, paid request, production artifact replacement, prospective registration, market release, or deployment is part of this delivery. Sourced settlement confirmation is covered by the route action's no-write-before-confirmation and posted-score-substitution tests. Browser settlement acceptance covers append-only notices and correction selectors. No performance or profitability claim follows from these checks.
