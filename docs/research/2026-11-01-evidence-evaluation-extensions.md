# Evidence and evaluation extensions

Date: 2026-11-01. Status: research proposals only. This note delivers Task 16 documentation, not feature activation. No experiments, coverage measurements, refits, registrations, or releases ran for this note. Tasks 12 and 15 remain implementation prerequisites, not assumed completed dependencies. Update 2026-11-24: the implementation plan records all 16 tasks delivered, including 12 and 15.

## Why these proposals stay separate

The [architecture](../plans/2026-11-01-review-remediation-architecture.md) separates correctness repairs from model hypotheses. The [validated review](2026-11-01-review-validation.md) confirms missing injury publication times and the shared-push comparison, but does not establish profitable replacements. The [source audit](2026-10-25-free-nfl-data-audit.md) does not establish a complete historical archive of pregame news or forecasts. The [historical evaluation](model-evaluation.md) is inspected, superseded development evidence, not independent validation.

Only `prospective-2026-10-26` can authorize release. Its per-market requirements remain 500 priced games, Brier and log loss no worse than the no-vig close, and a slate-clustered 90% log-loss difference interval with an upper endpoint at most zero. A successor design below has no release authority. No market is released by these documents.

The [project spec](../../.scratch/evidence-evaluation-extensions/spec.md) records delivery and activation boundaries. Terms follow the [glossary](../../GLOSSARY.md). The [README](../../README.md) describes the current journal, not the proposed features.

## Common experiment record

Each proposed experiment needs a frozen manifest before scoring. Record source paths and hashes, retrieval times, genuine publication times, eligible game IDs, cutoff rules, exclusions with reasons, feature and training versions, candidate checksums, chronological splits, tuning budget, metrics, uncertainty method, and activation decision. Unknown publication time stays unknown. Retrieval time never proves publication time. Mutable source pages need the captured excerpt or payload checksum and update wording.

Use earlier development seasons for fitting and tuning, then later untouched development blocks for comparison. Keep one game's rows together and respect result availability, including overlapping games. Report paired sample counts and full coverage denominators. Report missingness by season, team, position, and market where relevant. Do not select a candidate only from its best subgroup. Historical close-anchored comparisons remain development evidence under [ADR 0003](../adr/0003-anchor-forecasts-on-the-market.md).

Changed fitted inputs require versioned semantics, refit at a new path, and actual-time registration before future qualifying forecasts. Existing saved probabilities, primary roles, source facts, and registrations never change. The drafter explains code-owned facts under [ADR 0005](../adr/0005-compose-frozen-report-facts.md). Private lean never enters an evidence packet, starter decision, or fitted input.

## Structured manual QB evidence

**Provenance.** [Manual evidence](../../src/lib/server/sources/manual.ts) accepts generic facts and preserves publication and entry times. [Starter resolution](../../src/lib/server/models/starter.ts) uses timestamped depth charts, injuries, and recent starts. It does not establish a structured manual override contract. [Injury ingestion](../../src/lib/server/sources/injuries.ts) explicitly leaves publication times unknown.

**Eligible sample.** Propose a versioned record containing game, team, stable player ID, displayed name, position `QB`, designation, assertion kind, source URL, excerpt, publication time, retrieval time, entry time, and evidence ID. Separate `availability` from `named-starter`. Require team and roster identity at cutoff. Only source assertions published strictly before cutoff and captured by cutoff can influence a prospective decision. Undated notes remain visible but cannot resolve starter identity.

**Comparison.** Replay existing starter rules and the proposed evidence resolver on the same timestamp-qualified development cases. Compare known, assumed, unknown, conflicting, and incorrect starter counts against later independently sourced starter identity. Later identity is an evaluation label only. Compare forecasts separately only after a refit with the declared resolver.

**Exclusions.** Reject post-cutoff updates, ambiguous player matches, wrong teams, non-QBs, unsupported designations, and a report that merely predicts a starter. An `out` or `doubtful` designation may exclude a named player but cannot prove who starts instead. Questionable does not establish absence. Unknown or conflicting evidence is not a healthy designation.

**Activation.** An explicit user override must name the superseded evidence IDs and reason. Preserve those items and conflicts rather than deleting them. A qualifying explicit starter announcement may supersede an older depth chart. Conflicting contemporaneous assertions stay unknown until explicitly resolved with qualifying evidence. Add parser, conflict, cutoff, refresh, persistence, export, and shared analysis/board tests before use. Freeze the resolved identity and reason with the forecast. Changed resolver semantics require input-version review, refit where applicable, and new registration. This note does not enable an override UI.

## Non-QB coverage before an injury feature

**Provenance.** The [source audit](2026-10-25-free-nfl-data-audit.md) lists rosters and snap counts but does not measure their point-in-time completeness. The [injury helper](../../src/lib/server/models/injuries.ts) weights out and doubtful designations by snap share and position values. Helper existence does not establish usable live data or fitted value.

**Eligible sample.** First audit team-weeks with versioned injury reports, genuine publication times, roster joins, and snap shares from games completed before cutoff. Measure timestamp coverage, identity joins, snap denominators, publication lag, and report completeness. Distinguish explicit empty coverage from no rows. Freeze the snap window and offense/defense denominator before feature work.

**Comparison.** Compare coverage against dated official club reports, with adjudicated discrepancies. Only after that audit, compare the corrected baseline against one declared non-QB feature on paired chronological games. Report coverage-conditioned and full-cohort availability, not just complete-case scores. Treat position values as candidate assumptions, not measured causal effects.

**Exclusions.** Exclude QB duplication, current-game snaps, full-season future aggregates, unknown publication times, stale reports, unresolved identities, and unknown snap shares from weighted calculations. Retain unknown counts. Missing snaps do not mean zero impact. Do not infer a clean report from silence.

**Activation.** Require a documented coverage audit, a frozen feature definition and missingness policy, chronological ablation, parser and join tests, refit, and new registration. Coverage thresholds must be chosen before the audit's outcome is used to select a feature. Until those thresholds are specified and met, activation is blocked.

## Separate chronological development experiments

These are four experiments, not a combined feature bundle. Each uses the common manifest and keeps every other modeling choice fixed. Compare paired Brier and log loss against the corrected baseline and no-vig close, with slate-clustered uncertainty and coverage counts. Any promotion requires documented later-block evidence, versioned semantics, refit, and new registration. It cannot itself release a market.

### Era normalization

**Provenance.** Use hashed nflverse play-by-play and completed-game history identified in the [source audit](2026-10-25-free-nfl-data-audit.md). The [architecture](../plans/2026-11-01-review-remediation-architecture.md) explicitly leaves era normalization separate from play-sample corrections.

**Eligible sample.** Use only seasons with the corrected declared scrimmage sample and available outcomes before each cutoff. Estimate expanding league baselines from earlier eligible games, with a predeclared minimum history.

**Comparison.** Compare unnormalized efficiency with prior-only league-centered efficiency on identical chronological folds. Predeclare whether offense and defense use distinct baselines and freeze recency weighting.

**Exclusions.** Exclude target-game plays, future season means, overlapping unresolved games, and insufficient-history rows. Do not tune era boundaries on the evaluated block.

**Activation.** Require stable later-block behavior, explicit cache/training identity changes, and reproducible prior-only baseline tests before a candidate refit and registration.

### Garbage-time definitions

**Provenance.** Use versioned play-by-play fields and the Task 12 corrected sample specified in the [implementation plan](../plans/2026-11-01-review-remediation-implementation.md). No garbage-time filter is established as superior here.

**Eligible sample.** Keep the same eligible games while comparing all declared scrimmage plays with one predeclared score-and-clock filter. Freeze thresholds before evaluating. A separate win-probability filter requires provenance for that probability model and its training cutoff.

**Comparison.** Report excluded play counts, changes in team feature coverage, and paired later-game scores. Keep era normalization and all other inputs fixed.

**Exclusions.** Do not use final score or later plays to label an earlier play. Exclude kneels, spikes, and special teams under the baseline definition, not as an experimental improvement. An empty filtered sample is unavailable, not zero efficiency.

**Activation.** Require declared thresholds, sensitivity results that do not select on the final block, cache versioning, chronology tests, refit, and registration.

### Weather interactions

**Provenance.** [Weather evidence](../../src/lib/server/sources/weather.ts) uses forecast `updateTime` and the period containing kickoff. A schedule's observed game weather is not an archived forecast.

**Eligible sample.** Use prospectively captured forecasts issued and retrieved before cutoff, with supported venue coordinates, known roof state, units, and kickoff-period coverage. Freeze an interaction definition, such as wind with lagged passing tendency, before scoring.

**Comparison.** Compare baseline weather inputs with that single interaction on paired outdoor/open-roof games. Report missing forecast and roof counts separately. Closed-roof games provide a declared irrelevant-weather control, not fabricated zero wind observations.

**Exclusions.** Exclude actual game weather as a substitute, unknown issue times, post-cutoff forecast updates, unsupported international forecasts, ambiguous roof state, and missing numeric fields. Do not parse a qualitative phrase into an invented measurement.

**Activation.** Require a usable point-in-time archive, unit/period/roof tests, chronological interaction ablation, refit, and registration. Without the archive, only collection design is justified.

### Alternate de-vig methods

**Provenance.** [ADR 0004](../adr/0004-register-prospective-artifacts.md) fixes proportional no-vig decisive probabilities for the current comparator. The architecture separates probability-matched anchor corrections from alternate de-vig research.

**Eligible sample.** Use both sides from one sportsbook, one instant, one market, and identical rules and point line. Freeze a candidate method, such as a power transformation, and its numerical tolerance before testing.

**Comparison.** Compare proportional and candidate decisive probabilities while holding the outcome mapping, push treatment, and corrected input sample fixed. Report favorite/underdog and hold diagnostics without using them to choose after seeing final-block results.

**Exclusions.** Exclude cross-book pairs, missing sides, mismatched rules, unachievable transforms, and alternate lines treated as the same contract. Missing prices cannot imply 50/50.

**Activation.** Require numerical validity, chronological evidence, versioned anchor/training semantics, refit, and registration. Changing the release comparator would reopen ADR 0004 and requires an explicitly authorized successor policy. Keep the v1 comparator unchanged.

## Independent descriptive push calibration

**Provenance.** [Prospective scoring](../../src/lib/server/models/prospective.ts) scores frozen probabilities. [ADR 0004](../adr/0004-register-prospective-artifacts.md) assigns the same frozen push mass to model and close. Their relative losses cannot independently validate that mass.

**Eligible sample.** Use frozen primary model picks with proven pre-outcome completion, saved contract and push probability, and later resolved settlement. A close is not required for this descriptive sample. Report its overlap with the priced v1 sample. One game and market contributes once, never once per side or refresh.

**Comparison.** Compare mean predicted push probability with observed push frequency and binary push-event Brier/log loss. Predeclare probability bins and line strata, including integer/key lines and half-lines. Report sample sizes, push counts, and slate-clustered intervals. Compare to a prior-only empirical push baseline fitted on earlier development games, never a baseline fitted on the scored sample.

**Exclusions.** Exclude unresolved, void, ambiguous-rule, and missing-probability records with counts. A moneyline tie counts as push only under that contract's push rule. Wins and losses from other tie rules are not push labels. Missing probability stays unavailable.

**Activation.** Descriptive reporting requires tested contract grading, cohort selection, and saved-probability calculations. Recalibrating a predictive distribution requires a separate training revision, chronological validation, refit, and registration. These diagnostics never change current relative-loss release scoring or establish market push probabilities.

## Moved-line reference comparisons

**Provenance.** The [README closing rules](../../README.md#record-closing-prices) require the same market, side, line, book, and rules for a comparable close. A later different line is line movement.

**Eligible sample.** Route A uses later timestamped alternate quotes for both sides of the original contract at the original sportsbook. Route B uses a separately validated discrete distribution fitted without the evaluated outcomes, anchored to later two-sided prices and rules. Preserve original and later lines, times, source identities, and distribution checksum.

**Comparison.** Route A provides an observed same-contract reference when all matching rules hold. Route B yields an inferred reference probability at the original line. Validate Route B against held-out observed alternate-line pairs, reporting calibration, probability error, key-line behavior, coverage, and uncertainty. Do not merge either route's denominator with unmatched records.

**Exclusions.** A lone moved main line cannot identify the original line's fair probability. Exclude mismatched books/rules, post-kickoff observations, absent alternate pairs, and unsupported distribution tails. Do not turn point movement into decimal-odds change.

**Activation.** Require alternate-price provenance or a validated distribution, explicit observed/inferred labels, uncertainty, and tests against contract substitution. Inferred values never fill `comparable close` or the v1 prospective baseline. Any use for release needs an authorized successor protocol.

## Successor prospective protocol design

**Provenance.** [ADR 0004](../adr/0004-register-prospective-artifacts.md) and [testing guidance](../testing.md#evaluate-prospective-forecasts) bind v1 to registered artifacts and frozen records. Current parser acceptance of an identity is not project-policy permission to release under it.

**Eligible sample.** A successor draft must name its new ID, immutable predictor and input versions, actual registration time, future start, end or stopping rule, market-specific cohort, primary rules, close window, push treatment, line-reference rules, minimum sample, metrics, clustering, multiplicity handling, and missingness policy before its first qualifying observation. No numeric successor thresholds are selected in this note.

**Comparison.** Retain v1 scoring independently. A shadow successor can score only observations collected after its frozen registration, using its declared baseline and independent push diagnostics. Report overlapping and nonoverlapping samples explicitly. Never relabel inspected historical evidence as prospective.

**Exclusions.** Exclude pre-registration predictions, regenerated forecasts, unknown completion chronology, refresh duplicates, artifact mismatches, and missing required closes. Preserve excluded IDs and reasons. Withdrawal cannot selectively erase v1 evidence.

**Activation.** A draft must become a complete preregistered design, pass synthetic qualification and backup tests, and receive an ADR explicitly reopening the relevant parts of ADR 0004. Project instructions must explicitly authorize successor release before any such release is possible. Keep v1 registrations, results, thresholds, shared-push comparator, and reports intact. Under current policy, `prospective-2026-10-26` remains the sole release authority.

## Empirical limits and delivery checks

This note reads local sources and proposes experiments. It does not measure coverage, determine sample sizes, validate a distribution, select thresholds, or demonstrate predictive improvement. Existing helper types are not evidence that a feature ran live. No source download, provider call, database operation, or model fit was needed.

Documentation validation checks only these two new files for formatting, local link targets, required proposal fields, and prohibited punctuation. It does not establish application, browser, Neon, or release workflow verification under [testing guidance](../testing.md).
