# Correctness architecture implementation plan

> Execute this plan task by task with `superpowers:executing-plans`. This document authorizes no deployment, live database migration, provider request, or model release.

**Goal.** Repair the six review findings and complete the prospective release command while preserving the journal's frozen history.

**Architecture.** Keep the existing domain, forecasting, analysis, provider, and persistence modules. Put each invariant in one shared owner and make callers supply the facts that owner needs. Release decisions come from qualified frozen records and later observations, never imported verdicts.

**Tech stack.** SvelteKit, Svelte, TypeScript, Vitest through Vite+, Playwright, and PostgreSQL through the existing Neon repository.

**Implementation constraint.** The project instructions permit release only under `prospective-2026-10-26`. References below to a successor protocol do not authorize releasing one. A new artifact may be bound to the unchanged original protocol at the actual registration time, with only later forecasts eligible. Existing forecasts cannot acquire registration retrospectively. The frozen protocol criteria and cohort requirements remain unchanged.

## Scope and working checklist

- [x] Ground the design in the review reproductions, existing source, glossary, journal spec, and ADRs 0002 and 0003.
- [x] Sketch two architectural candidates and synthesize their strongest choices.
- [x] Agree on the documented architecture. The subsequent implementation request authorizes the seven tasks below.
- [x] Implement all seven increments. Final gates are tracked in the completion record below.
- [x] Retain the shared-owner design. No replacement architecture was needed.

Throughput checkpoint is n/a for the original planning task. Implementation proceeds as seven verifiable increments. The calibration and report increments can proceed independently. Release integration depends on qualified samples and closing chronology. On the dual-core verification host, application and database gates run sequentially because concurrent fitting and migration checks exhausted fitting-test budgets.

Keep the NFL pregame moneyline, spread, and total scope. Preserve policy thresholds, the prospective protocol's criteria, and the distinction between research analyses, model picks, and actual bets. Do not add predictive features or tune against prospective outcomes.

## Existing architecture and evidence

The forecasting artifact learns an adjustment to a market anchor. `models/forecast.ts` combines the anchor with that adjustment for decision-time probabilities. `models/train.ts` currently omits the anchor when it builds calibration probabilities. It also pairs independently filtered market rows by array position.

`analysis/run.ts` freezes a research attempt and asks the provider to explain its policy conclusion. `analysis/board-run.ts` freezes model picks before drafting explanations. The research packet currently lacks the exact research offer. Both report paths validate structured fields more strictly than prose.

`analysis/store.ts` and `analysis/neon-store.ts` implement the application journal. `db/repository.ts` owns database persistence and backup validation. Closing comparisons currently have contract identity and prices but no chronology requirement.

`models/prospective.ts` currently accepts caller-built scoring rows. It counts rows rather than proven primary games. `models/release.ts` also trusts an incoming evaluation's market release flags. `scripts/model/release.ts` cannot supply prospective evidence.

The review reproduced an accepted earlier close, an accepted explanation with a different total and price, an accepted thesis omitting all supplied gaps, and a release result from 500 copies of one historical identifier. The saved baseline artifact's total calibration has observations only in the extreme probability bins.

The latest review run passed formatting, lint, types, and 580 unit tests. One refit test exceeded its five-second budget. The application check stopped before build and browser acceptance. The earlier sandbox run had process and loopback permission failures. Treat neither run as full verification.

## Proposed module ownership

| Owner                                                                    | Responsibility                                                                                                                      | Callers                                                        |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `models/anchor.ts` and a small `models/anchored-probabilities.ts` module | Convert a two-sided quote into an anchor and combine it with a learned adjustment and residual distribution.                        | Calibration, historical evaluation, and frozen live forecasts. |
| `models/train.ts`                                                        | Build market-specific walk-forward observations keyed by game identity.                                                             | Artifact fitting.                                              |
| `analysis/prospective-sample.ts`                                         | Join frozen primary model picks, protocol provenance, settlement, and closing observations. Produce inclusion or exclusion results. | Prospective evaluation command.                                |
| `models/prospective.ts`                                                  | Score a qualified sample and report coverage and exclusions.                                                                        | Evaluation and release.                                        |
| `models/release.ts`                                                      | Enforce the exact registered protocol and compute release from scored observations.                                                 | Release command and artifact creation.                         |
| `analysis/closing.ts`                                                    | Enforce chronology and contract compatibility for every subject kind.                                                               | Memory, Neon, summaries, and backup comparison projection.     |
| `analysis/packet.ts` and `providers/contracts.ts`                        | Supply the frozen research offer and mandatory gaps to the drafter.                                                                 | Research run, repair, and durable finalization.                |
| `analysis/report-validation.ts` and `analysis/pick-explanation.ts`       | Validate generated evidence references and render authoritative facts from frozen data.                                             | Provider adapters, saved reports, and exports.                 |

These are proposed additions to existing owners, not a new service layer. Do not introduce a workflow engine or a second journal repository.

## Synthesis decision and alternatives

Candidate A is the base. It repairs existing owners and adds one journal-to-model adapter. Candidate B contributed authoritative report composition, explicit protocol registration, and discriminated market and report types. The independent comparison favored A on module ownership and B on the missing-cohort constraint. Both covered the findings and preserved historical records.

Reject B's direct dependency from pure model scoring on journal backups. The adapter hides journal relationships while scoring receives qualified domain observations. Also reject local regex additions as the sole numeric guarantee. Typed references and code-rendered facts remove duplicated numerical authority.

We accept changes to provider schemas, record parsers, and internal release signatures in exchange for one owner per invariant. Historical report versions remain readable. No existing ADR is reversed. Record the new protocol-registration and report-composition decisions in separate ADRs during their implementation increments.

## Caller usage and data shapes

The following signatures are design sketches. Derive identifiers and record types from existing authoritative types when implementing. Parse unknown input once at the external boundary.

```ts
type CalibrationObservation = {
  gameId: string;
  market: Market;
  kickoff: string;
  resultAvailableAt: string;
  block: number;
  anchor: AnchorLine;
  adjustmentMean: number;
  outcome: Outcome;
};

function anchoredProbabilities(input: {
  anchor: AnchorLine;
  adjustmentMean: number;
  residuals: ResidualDistribution;
  offer: Offer;
}): OutcomeProbabilities;

type SampleDecision =
  | { included: true; record: QualifiedForecastRecord }
  | { included: false; subjectId: string; reasons: SampleExclusion[] };

// Only the qualification constructor creates this internally branded type.
type QualifiedProspectiveSample = {
  protocolIdentity: string;
  records: readonly QualifiedForecastRecord[];
  exclusions: readonly Extract<SampleDecision, { included: false }>[];
};

function buildProspectiveSample(input: {
  protocol: RegisteredProtocol;
  journal: JournalExport;
}): QualifiedProspectiveSample;

function evaluateProspectiveForecasts(input: {
  protocol: RegisteredProtocol;
  sample: QualifiedProspectiveSample;
}): ProspectiveEvaluation;

function releaseArtifact(input: {
  artifact: ModelArtifact;
  protocol: RegisteredProtocol;
  sample: QualifiedProspectiveSample;
}): ModelArtifact;
```

`QualifiedForecastRecord` contains the source board and model-pick identities, game and market, frozen primary designation, completion provenance, cutoff, frozen kickoff, artifact checksum, protocol identity, input-availability version, probabilities, and contract. Settlement and closing data remain separately identified observations. Use a module-private brand or constructor so ordinary callers cannot create qualified records by supplying a boolean.

`RegisteredProtocol` contains the exact frozen settings and artifact binding, with evidence of when that binding was registered. A checksum or `frozenBeforeOutcomes: true` alone cannot prove registration happened before outcomes. If the existing journal cannot prove a binding for `prospective-2026-10-26`, expose that gap and block release. Never fabricate registration or backdate a replacement artifact. A new prospective run needs a genuinely prospective registration and identity if the frozen rules require it.

Use discriminated margin and total anchor inputs in the shared pricing function. A total anchor must not type-check with a margin distribution. Use versioned research and model-pick report variants so a research policy packet cannot substitute for a model pick.

For closing comparisons, callers pass an entry reference with its contract and chronology. A research analysis or model pick uses its frozen offer observation time. An actual bet uses its placement time. A missing entry time is an explicit unavailable state.

```ts
type ClosingEntry =
  | {
      kind: "research" | "model-pick";
      contract: ClosingContract;
      observedAt: string;
      kickoffAt: string;
      decimalOdds: number;
    }
  | {
      kind: "actual-bet";
      contract: ClosingContract;
      placedAt: string;
      kickoffAt: string;
      decimalOdds: number;
    }
  | { kind: "legacy-unknown"; reason: string };

function compareClosing(input: {
  entry: ClosingEntry;
  close: ClosingObservation;
}): ClosingComparison;
```

For research drafting, extend `ThesisPacket` with a copied frozen offer and explicit game labels. Include market, selection, point line, American and decimal price, sportsbook, observation time, and settlement rules. Keep the private lean outside this type. Use the same packet builder for initial drafting, repair, validation, and durable finalization.

## Task 1. Establish behavioral regressions and a usable verification baseline

Files include `tests/model/uncertainty.test.ts`, `tests/model/prospective-evaluation.test.ts`, `tests/model/release.test.ts`, `tests/store-contract.ts`, `tests/providers/thesis.test.ts`, `src/lib/server/analysis/board-explanation.test.ts`, and `tests/model/ablation.test.ts`.

1. Add failing public-behavior regressions for each review reproduction. Keep each regression with its owning task if a single preparatory commit would leave unrelated tests failing.
2. Reproduce the refit timeout alone. Inspect the subprocess exit, stderr, and artifact output before changing its budget.
3. If legitimate fixture fitting exceeds the budget, give that test an explicit fitting budget consistent with `docs/testing.md`. Keep the assertion that the artifact in use is unchanged on failure.
4. Record a baseline check result. Do not treat an environment failure as an application assertion failure.

Run focused tests with `npx vp test run <file>`. Expected initial regression results are the known incorrect acceptance or incorrect calibration output. After each implementation task, its focused suite must pass before the next dependent task starts.

## Task 2. Unify anchored calibration and live probability calculations

Modify `models/train.ts`, `models/anchor.ts`, `models/forecast.ts`, and relevant callers in `models/evaluate.ts`. Create `models/anchored-probabilities.ts` only for the shared calculation that removes actual duplication. Extend model uncertainty, anchor, and fitting tests.

1. Construct market observations by game identifier and market. Carry the original row, fold, anchor, and outcome together. Eliminate joins through independently filtered array positions.
2. Add the anchor mean to the adjustment before evaluating margin or total outcomes. Use each market's own quote and settlement rules, including moneyline tie treatment.
3. Reuse the pure probability calculation in calibration, historical scoring, and live forecast freezing. Keep data loading and model fitting outside it.
4. Preserve walk-forward availability rules. Fit a block's residual distribution using only results available before that block. Audit shrink-factor and anchor-estimation inputs for the same temporal restriction.
5. Test a zero adjustment at a symmetric total line with a symmetric residual fixture. The over and under probabilities should agree after push treatment. Test moneyline, spread, missing market prices, and differently filtered market histories.
6. Test that changing a later result does not change earlier calibration predictions. Test that a missing total does not shift another game's margin pairing.
7. Version the calibration-generation semantics and produce a new artifact file. Keep old snapshots and artifacts readable. Block artifacts with invalid calibration from release eligibility until refit. Do not overwrite the artifact in use or regenerate saved forecasts.

Acceptance requires probabilities to agree across calibration and the frozen forecast path for identical inputs. A realistic fixture must exercise middle probability bins. Do not use improved historical scores as evidence of release.

## Task 3. Make closing chronology a shared journal rule

Modify `analysis/closing.ts`, `analysis/store.ts`, `analysis/neon-store.ts`, `analysis/board-store.ts`, `analysis/model-pick-performance.ts`, and `db/repository.ts`. Extend the shared store contracts and integration tests.

1. Resolve each subject into `ClosingEntry` without borrowing terms from another record.
2. Require `entryTime < close.observedAt < frozenKickoff`. Preserve the existing contract and rules checks. Reject new earlier or equal-time closing submissions with a visible error and no write.
3. Use the same comparison function in memory, Neon, readback, performance summaries, and restore-derived projections.
4. Preserve previously saved observations verbatim. For an old observation that fails chronology, derive an unavailable comparison and exclude it from the comparable-close denominator. Preserve the original stored comparison as historical data if it exists.
5. Validate the entire backup before restore writes. A valid older version 1 backup remains restorable even if a saved comparison is no longer trustworthy. Derive comparability from its original facts. Missing times stay unavailable. Reject malformed timestamps and conflicting identities atomically.
6. Test research offers, actual bets at different terms, and model picks. Cover earlier, equal, later, after-kickoff, missing-time, different-line, and incompatible-rule cases. Assert unchanged journal state after rejected writes.

Acceptance requires identical memory and Neon results, unchanged raw legacy records, and corrected summary denominators. Any schema change uses a new ordered migration file and disposable database tests. Do not execute a migration against `DATABASE_URL` as part of this work.

## Task 4. Build prospective samples from qualified frozen primary records

Create `analysis/prospective-sample.ts`. Modify `models/prospective.ts`, `models/release.ts`, and boundary parsers in `models/inputs.ts`. Extend prospective, release, backup, and primary-record tests.

1. Use primary model picks as the proposed release cohort. Verify that the existing protocol actually froze this cohort. If that fact is absent, keep the existing protocol blocked and establish the cohort in a successor protocol before outcomes. Assessment and actual-bet performance retain their separate cohorts. Never pool them to reach the sample threshold.
2. Resolve the existing protocol registration and frozen artifact binding. Compare every frozen setting with its authoritative registration, including markets, period, input version, sample requirement, and interval method.
3. Include only the saved primary game-market observation with proven qualifying completion, cutoff before frozen kickoff, matching artifact, and matching input protocol. Do not recompute a primary from later outcomes or invent missing completion provenance.
4. Apply the protocol period to the frozen decision cutoff using a start-inclusive and end-exclusive interval. Validate timestamp ordering separately. Retain each excluded record and a specific reason in the coverage report.
5. Detect duplicate source identities and duplicate game-market primary claims. Deduplicate repeated identical input records. Reject conflicting duplicates. Never count a refresh as another game.
6. Derive slate labels from frozen kickoff using the existing `slateOf` rule. Do not trust caller-provided slate names.
7. Join later settlement and compatible two-sided closing observations by game, market, selection, line, book, and rules. Preserve the distinction between the journal's single-contract odds change and a two-sided no-vig scoring baseline. Missing complementary prices make the scoring baseline unavailable.
   Add a distinct `ClosingMarketSnapshot` when existing saved observations cannot establish both sides. It stores an identifier, game identifier, market, paired quotes, sportsbook, point line, rules, source, observation time, and capture time. The journal repository owns append-only persistence through `recordClosingMarketSnapshot` and `listClosingMarketSnapshots`, exposed by both application stores. Add a manual journal capture action and an optional `closingMarketSnapshots` version 1 export collection. Reuse the game-board quote parser for shape validation without treating a game board as an analysis. Do not infer a complementary quote from one side or use the original game board as a later close. Source both outcome probabilities from this snapshot and validate its chronology against the forecast cutoff and kickoff. Test capture, duplicate handling, export, restore, and no-vig derivation through the shared storage contracts.
8. Score saved probabilities only. Never call the current forecasting model while building or evaluating the sample.
9. Replace public release paths that accept arbitrary `ProspectiveEvaluation` verdicts with recomputation from the qualified sample. Validate probability distributions and counts before scoring. Keep diagnostic reports serializable, but give their `release` fields no input authority.

Acceptance requires the 500-copy historical reproduction to produce no released market. Test pre-period records, refreshes, bad completion provenance, modified protocol settings, mismatched artifacts, forged result flags, missing closes, unavailable outcomes, and valid independent passing and failing samples.

## Task 5. Complete the prospective evaluation and release commands

Create `scripts/model/prospective.ts` and its `package.json` command. Modify `scripts/model/release.ts`, `models/inputs.ts`, and command-boundary tests. Update `docs/testing.md` and model evaluation documentation.

1. Accept an explicit version 1 journal export and registered protocol file. Read files only. Do not connect to the user's database or fetch sources.
2. Build the qualified sample and write a versioned diagnostic report with exclusions, denominators, source identities, protocol identity, and artifact identity.
3. Let the release command accept the same source bundle and recompute eligibility. Never accept an edited report's `released: true` as proof.
4. Preserve the historical-only command behavior as an explicit refusal. Migrate internal callers together and remove the old trusted-verdict release API.
5. Validate every input before writing. Write a new output artifact atomically. Refuse an output path that aliases an input artifact or an existing artifact. Failure must leave inputs and existing outputs unchanged.
6. Test the real commands with temporary files. Cover malformed JSON, missing provenance, manipulated verdicts, period mismatches, a valid failed sample, and a valid passing synthetic sample.

Proposed usage after implementation:

```sh
npm run model:prospective -- journal-v1.json protocol.json prospective-report.json
npm run model:release -- artifact.json journal-v1.json protocol.json released-artifact.json
```

Production evidence remains insufficient unless the actual frozen protocol passes. Passing synthetic tests does not release a real market.

## Task 6. Give drafting the frozen offer and enforce evidence gaps

Modify `providers/contracts.ts`, `analysis/packet.ts`, `analysis/run.ts`, `analysis/report-validation.ts`, fixture drafters, provider repair paths, and corresponding tests.

1. Extend the research packet with the exact frozen game and offer. Keep the private lean out of all provider payloads.
2. Give gaps stable identifiers when a new attempt is frozen. Compose the authoritative gap list directly from the saved packet in code. Permit separately identified additional model caveats, but never let generated content replace mandatory gaps. Derive old string gaps without rewriting old records.
3. Require supporting claims to have an opposing case, as today. Keep an explicit insufficient-evidence report valid when no supported claims can be made. Do not force invented opposing evidence.
4. Validate every evidence and gap reference that generated claims use. Unresolved references trigger the existing bounded repair flow and then a visible failure. Mandatory gaps do not require provider acknowledgment or an extra paid repair because the composer always includes them. Preserve original and repair usage accounting.
5. Rebuild validation expectations from the saved offer during durable finalization. `finalizeFromDurable` must not use the response's own odds as its expected odds.
6. Assert the actual outgoing requests include exact wager terms, carry the mandatory gaps, and exclude private lean data. Test same-price offers with different markets, sides, or lines.

Acceptance requires an empty generated `missingInputs` list to produce a final report containing every frozen packet gap. This intentionally supersedes rejection-only validation with a stronger deterministic output rule. A repair or durable retry must use the original packet and must not initiate an unapproved replay of an ambiguous provider request.

## Task 7. Render authoritative pick facts outside generated prose

Modify `analysis/pick-explanation.ts`, `providers/contracts.ts`, report renderers, fixture and real-provider request builders, and model-pick explanation tests. Read `DESIGN.md` before any page edit.

1. Keep side, grade, contract terms, probabilities, expected value, and release label in a deterministic facts block derived from the frozen pick.
2. Replace provider-authored mathematical restatements with structured fact references. Resolve references through the current market's frozen facts, never a board-wide list of numbers. A valid number from another market must not authorize a contradiction.
3. Use typed claim templates for statements that name a picked side, grade, line, or price. Allow the provider to choose supplied evidence references and explanatory mechanisms. Render contract-bearing sentences in code. Keep any free-form commentary visibly separate from authoritative facts and reject explicit contradictions through the existing validator.
4. Keep the raw provider response in request history. Save rendered text, the structured explanation version, and a renderer version for new reports. Do not silently re-render an old frozen report under a new formatter.
5. Fail new contradictory explanations visibly while keeping the model pick. Test unsigned total lines, decimal odds, signed lines, percentages, other-market values, changed sides, and changed grades. Keep the over 99.5 at decimal 3.00 reproduction as a regression.
6. Apply the same fact-reference renderer to numeric research-report statements where practical. Do not claim that regex checks prove arbitrary natural-language factual accuracy. The code guarantees facts it renders and references it validates.

Acceptance requires the browser and exported report to show the exact frozen wager. A provider failure must not remove, replace, or regenerate the saved pick.

## Delivery and compatibility gates

Preserve export version 1. Add optional versioned record fields only when older records can express their absence honestly. Extend backup validation before a writer emits new fields. Test restoring old exports, round-tripping new fields, rejecting conflicting identifiers, and preserving raw frozen reports.

Persist protocol registration only if existing records cannot establish it. The journal repository is the authoritative writer for append-only registrations, and the registration parser belongs in `models/protocol.ts`. Store protocol definition, artifact identity, cohort, and server-assigned registration time together. New forecast records reference that registration when captured. Export the registration with those records as an optional version 1 collection. A protocol input file is a reference checked against the exported registration, not independent proof. Add an explicit registration command or application action before forecast capture. Reject mutation under an existing registration identifier and reject enrollment of older forecasts. Use an ordered migration and shared storage contracts for this data. Do not maintain a second mutable registry in settings or model files.

Run each task's focused tests, then the required commands:

```sh
npm run verify
TEST_DATABASE_URL='explicit-disposable-connection' npm run verify:database
```

Use the isolated production browser flow to submit a research analysis and game board, reject a contradictory draft, record a later close, settle a placed contract, and export and restore the journal. Assert saved records and outgoing requests. Update fixtures and their pinned model identity only after a deliberate refit to a new unreleased fixture artifact.

Do not mark completion until both verification commands pass. A missing disposable database leaves the storage gate explicitly incomplete. Do not use `.env` or `DATABASE_URL` as a test fallback.

## Decisions and remaining risks

Model the Domain puts calibration rows in game-market observations and release inputs in qualified records. Type System Discipline gives protocol and sample qualification a constructor at the boundary. Prove It Works requires command-level, shared-storage, and production-browser checks for each delivered guarantee.

The proposed release cohort is primary model picks, which preserves one observation per game and market. Missing evidence that the original protocol froze this cohort keeps that protocol blocked. Any successor freezes its cohort before collecting qualifying observations. The sample thresholds and statistical criteria remain unchanged.

Some historical records may remain excluded permanently because completion, registration, or closing provenance is missing. Preserve those records without manufacturing qualification. Refit artifacts start new predictions and never repair prior predictions retroactively.

## Implementation completion record

All seven increments are implemented and verified. Verification failures were corrected rather than skipped. Both aggregate gates passed on 2026-10-30.

- Application gate: `npm run verify` passed formatting, lint, Svelte and TypeScript checks, 643 ordinary unit tests, 3 isolated density-grid tests, the production build, and all 36 production-browser tests.
- Storage gate: `TEST_DATABASE_URL=... npm run verify:database` passed all 104 tests across 4 files against explicit disposable PostgreSQL storage. The user's journal was not used by this gate.

| Task | Delivered behavior                                                                                                                       | Repeatable evidence                                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Baseline application and disposable database checks, with regressions for the review findings                                            | `npm run verify`, `npm run verify:database`                                                                                     |
| 2    | Intercept-bearing anchored forecasts, market-specific anchors, chronological calibration, and a deliberately refitted unreleased fixture | `tests/model/anchored-parity.test.ts`, `tests/model/calibration-chronology.test.ts`, `tests/model/uncertainty.test.ts`          |
| 3    | Shared closing chronology for analysis, model-pick, and actual-bet contracts, with raw historical backup preservation                    | `src/lib/server/analysis/closing.test.ts`, `tests/store-contract.ts`, `tests/board-store-contract.ts`                           |
| 4    | Qualified frozen primary samples, registration binding, explicit exclusions, and duplicate protection                                    | `tests/model/prospective-journal.test.ts`                                                                                       |
| 5    | File-only prospective diagnostics and release recomputation, with atomic new-file output                                                 | `tests/model/prospective-command.test.ts`                                                                                       |
| 6    | Frozen research offer, validated evidence and gap references, code-composed mandatory gaps, and durable saved-offer validation           | `tests/providers/thesis.test.ts`, `src/lib/server/analysis/run.test.ts`                                                         |
| 7    | Versioned explanation references, saved rendered facts, visible contradictory-draft failure, and preserved frozen picks                  | `src/lib/server/analysis/board-explanation.test.ts`, `tests/e2e/prospective-capture.spec.ts`, `tests/e2e/research-flow.spec.ts` |

The journal capture and restore journey is exercised against the production server without provider credentials. Shared storage contracts run against both memory and disposable PostgreSQL storage. Synthetic passing samples test release mechanics only. No real market was released, no provider request was made, and no live database migration or deployment was performed.
