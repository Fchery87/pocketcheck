# PocketCheck Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a personal NFL pregame research application that evaluates a recorded sportsbook offer, explains its evidence and mathematics, and preserves an honest record of experimental recommendations.

**Architecture:** One local SvelteKit application handles UI, data adapters, deterministic calculations, and AI calls. Neon stores compact durable records; ignored local files hold large public datasets and versioned model artifacts. AI explains an immutable evidence packet and cannot create the statistical probabilities or change the application's recommendation policy.

**Tech Stack:** SvelteKit, TypeScript, Vite+, compatible Node LTS, npm lockfile, Neon Postgres, SQL migrations, runtime input schemas, Vite+ tests, svelte-check, and Playwright. Provider integrations use direct HTTP through small application-owned adapters; no SDK or agent framework is required initially.

---

## 1. Status, evidence, and scope

Planning deliverable dated 2026-10-25; no application exists yet. Repository inspection found project guidance only and no Git repository. Preserve those files when scaffolding. Do not assume a worktree or commits are possible before repository initialization; initialization is an implementation setup step, not work performed by this plan.

The user confirmed the [MVP specification](../../.scratch/pocketcheck-mvp/spec.md). Read these primary-source research notes before implementation:

- [Handicapping fundamentals](../research/2026-10-25-handicapping-fundamentals.md)
- [Free NFL data audit](../research/2026-10-25-free-nfl-data-audit.md)
- [Stack and AI feasibility](../research/2026-10-25-stack-and-ai-feasibility.md)

The zero-additional-cost approach is viable for a constrained personal research workflow, not a guarantee of comprehensive free historical evidence, continuous service, or profitable recommendations. Account permissions, provider billing allowances, current source schemas, and the exact SvelteKit/Vite+ build remain integration checks. No paid call or account change was made for this plan.

### Delivery order and gates

| Milestone                        | User-visible outcome                                             | Gate                                                                                            |
| -------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| A: research and source contract  | Handbook, source coverage, explicit limitations                  | Every required input has a verified adapter or visible manual/missing path                      |
| B: working research journal      | Enter offer, gather evidence, read sourced thesis, save versions | One real future NFL game completes the workflow; missing data and provider failures are visible |
| C: evaluated baseline            | Reproducible probabilities for the three markets                 | Chronological evaluation, baselines, calibration and uncertainty documented                     |
| D: experimental value assessment | Price-dependent thesis/pass and prospective results              | Policy frozen before prospective outcomes; every recommendation reconstructable                 |
| E: evidence review               | Decide whether recommendations merit continued use or expansion  | Performance report includes negative findings and uncertainty; an edge is not presumed          |

The handbook/source audit is delivered with this plan. Milestone A's live adapter checks remain implementation work. Milestones B-D can be useful even if E finds no betting advantage.

## 2. User experience

Use four primary destinations: Analyze, Journal, Handbook, Settings.

1. Select a scheduled NFL game; show date, local timezone, away/home teams, venue, and kickoff.
2. Add an offer: sportsbook, full-game market, selection, line where applicable, American price, observed time, and settlement rules. Request the opposite price with the identical line and observation time where available. Warn when offers are not comparable.
3. Optionally save a private initial lean and rationale. Exclude this lean from the independent system analysis; reveal the comparison after the report is complete.
4. Click Analyze. Show stages: checking inputs, collecting evidence, computing, drafting, checking report. Show partial failures and missing inputs.
5. Read the decision, exact offer, numerical basis if available, evidence for and against, uncertainty, and conditions that would change it. Distinguish data coverage from model confidence.
6. Refresh explicitly. A new immutable run links to its parent; show a concise change comparison for prices, evidence, model and conclusion.
7. Later record an actual bet or no bet, then settle results. Preserve all system analyses regardless of user action.

The first research-only release may say insufficient evidence for a numerical value recommendation while still delivering useful cited research. Never label a missing estimate as zero probability or zero EV. Never imply a saved report is current after an odds or material information change.

### Report contract

- Identity: game, kickoff, market/rules, sportsbook, exact offer, recorded and analysis cutoff times.
- Conclusion: pass, wait, insufficient evidence, experimental lean, or experimental value candidate. Numeric value candidates require the baseline gate below.
- Mathematics: decimal odds, break-even probability conditional on no push when appropriate; market margin only if comparable opposing prices exist; model win/loss/push probabilities and EV only when available.
- Evidence: source-linked supporting and opposing claims with publication/effective and retrieval times where known.
- Method: model version, features, training cutoff, evaluation status, provider/model used for prose, prompt/report schema version.
- Uncertainty: unavailable or stale evidence, model limitations, sensitivity scenarios, unmodeled developments.
- Invalidation: conditions such as worse price, quarterback availability, changed kickoff/venue or weather, or missing confirmation. A price cutoff is computed from the model, not invented by AI.
- Comparison: separately display the user's original lean and notes after independent analysis.

## 3. Source and time policy

Start with the minimum source set in the data audit. Make ingestion deterministic before adding general internet search.

- Every item has `retrieved_at`; use `published_at` or `effective_at` only when the source actually supplies it. Unknown is a real state.
- Each run freezes a decision cutoff and references exact evidence versions. Keep original odds and market terms.
- Source freshness limits are configuration with rationale and a policy version. Choose them during the adapter spike according to documented update cadence and the decision being made; do not claim all facts have the same expiry.
- Historical training only uses games completed before each decision cutoff. Revised final public datasets permit statistical experiments but may not establish exact historical publication-time availability. Label that limitation.
- Historical injury/news/weather features require genuine archived pregame evidence. Current forecasts, final-season aggregates, postgame articles, and an AI's knowledge of past results cannot fill that gap.
- Unknown quarterback availability or other material uncertainty produces a scenario analysis, wait, or insufficient-evidence outcome. A manual source has URL/text, source time if known, entry time, and an explicit manual designation.
- Cache fetched datasets locally, record checksums/schema versions, and deduplicate evidence. Store only permitted excerpts/data, not an unlimited mirror of articles.
- Use official final results as the primary settlement input; manual corrections carry a reason and history. Postponements, cancellations, and book-specific voids are explicit.

## 4. Application boundaries and file map

Use a single project at repository root, not a monorepo. These are proposed paths to create, not existing files:

```text
src/routes/+page.svelte                       Analyze form and progress
src/routes/+page.server.ts                    Load games; validated analysis action
src/routes/analysis/[id]/+page.svelte          Saved thesis and history
src/routes/analysis/[id]/+page.server.ts       Read immutable report
src/routes/journal/+page.svelte               System analyses and actual bets
src/routes/journal/+page.server.ts            Filters, result updates, export
src/routes/handbook/+page.svelte              Learning material and formula examples
src/routes/settings/+page.svelte              Provider/model selector and status
src/routes/settings/+page.server.ts           Discovery and compatible model selection
src/routes/api/analyses/[id]/+server.ts        Poll bounded local analysis progress
src/lib/domain/                              Offer/report schemas and pure mathematics
src/lib/server/db/                           Parameterized SQL and transactions
src/lib/server/sources/                      NFL, weather, manual evidence adapters
src/lib/server/providers/                    TheClawBay and DeepSeek adapters
src/lib/server/analysis/                     Run lifecycle, evidence packet, report checks
src/lib/server/models/                       Baseline inference and artifact loading
scripts/data/                               Explicit public-data import commands
scripts/model/                              Local fit/evaluate commands
migrations/                                 Numbered SQL migrations
tests/fixtures/                             Small documented public/artificial examples
tests/e2e/                                  User-flow tests with provider/source fixtures
data/                                       Ignored local source caches and artifacts
```

Keep odds conversion, settlement, EV, and evaluation metrics independent of the framework, database, and AI. A small source adapter returns normalized observations with provenance; a provider adapter discovers models and drafts a schema-constrained thesis from a supplied evidence packet. The run coordinator owns policy and lifecycle. Prefer direct module calls over an event bus, agent swarm, vector database, or workflow platform.

Long-running local analysis: save a pending run, start a bounded in-process task, and poll its persisted state. Single-user limits permit one active analysis at a time. On restart, mark abandoned running tasks interrupted and offer explicit retry as a new run. No paid queue or hidden autonomous research loop. Set bounded timeouts, retry only safe fetches, and avoid duplicate AI calls on form resubmission.

## 5. Durable records and invariants

Use Postgres SQL migrations and one small repository layer; select a compatible lightweight driver during the database spike. All timestamps are UTC internally; display America/New_York by default with the timezone visible.

| Record            | Minimum fields and relationships                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| games             | Stable source/game ID, season/week, teams, kickoff, venue, status; version changed schedules                                                    |
| offers            | Game, sportsbook, market, selection, line, American odds, observed time, entered time, full-game/overtime and tie/void rules; immutable         |
| evidence          | Source ID/URL, retrieval and known publication/effective times, checksum, normalized facts or permitted excerpt, manual/automatic, completeness |
| analyses          | Offer ID, parent run, cutoff, lifecycle status, method/policy/schema/prompt versions, evidence-packet hash, provider/model, failure reason      |
| analysis_evidence | Exact evidence IDs associated with each run; completeness assessment                                                                            |
| predictions       | Analysis, artifact ID, win/loss/push probabilities, derivation, EV, uncertainty and experimental status                                         |
| reports           | Analysis ID, validated structured claims and source references, rendered thesis, usage metadata when returned                                   |
| user_research     | Original lean and rationale tied to the request; excluded from AI evidence by default                                                           |
| bets              | Actual selected offer/price, placement time, stake in units; separate from system recommendation                                                |
| settlements       | Game/offer or bet, win/loss/push/void/unresolved, rules, source, settled time, correction history                                               |
| model_artifacts   | Local artifact path/hash, feature and data manifests, training cutoff, evaluation report, release status                                        |
| settings          | Selected provider/model, catalog refresh metadata, compatible capability state, non-secret preferences                                          |

Enforce: nonzero valid American prices; finite numeric values; market-specific required fields; probability sums within a stated numeric tolerance; same-game references; kickoff later than the pregame cutoff; unique external IDs; no editing a completed run's offer/evidence/prediction. Use database constraints where applicable and validated boundary schemas elsewhere. Record secrets only in private environment files excluded from source control, never in settings tables or report exports.

Price orientation must be explicit: a spread is the selected team's handicap, so `selected_team_margin + line > 0` wins. For a total, compare final combined points with the stored line and selected over/under direction. Store the away/home mapping instead of relying on text order. Exclude exotic settlement rules the app cannot represent.

## 6. Mathematical contract

The handbook supplies derivations. Implementation requires exact worked-example tests, not AI arithmetic.

- For American price `A > 0`, decimal odds `d = 1 + A/100`; for `A < 0`, `d = 1 + 100/abs(A)`.
- Without pushes, break-even `1/d`; with pushes, this is the required win fraction among decisive outcomes. Unconditional break-even wins are `(1 - pPush)/d`.
- A simple margin-removal estimate normalizes reciprocals of decimal odds across exhaustive comparable outcomes. It is a market proxy, not proven true probability. When opposing odds are missing or at different spread lines, omit this calculation rather than fabricate it.
- Per unit EV is `pWin * (d - 1) - pLoss`; pushes/voids return the stake. Also display the assumptions supplying these probabilities.
- Price threshold for target EV `e`: `dMinimum = 1 + (pLoss + e)/pWin` when `pWin > 0`. Name the target and uncertainty policy; do not silently reprice a saved offer.
- Unit return: win `stake * (d - 1)`, loss `-stake`, push/void `0`. Report pushes/voids separately. ROI is total profit divided by sum of settled stakes under a documented denominator policy; empty denominator means unavailable.
- Brier/log loss evaluate probabilities against mutually exclusive outcomes. For markets where pushes are possible, use a consistent multiclass score or an explicitly labeled conditional decisive-result evaluation; never grade a push as a loss.

Required examples: -110 gives decimal 1.90909 and 52.38095% decisive break-even; a hypothetical 55% no-push probability gives +0.05 units EV per unit. With 52% wins, 45% losses, 3% pushes at -110, EV is about +0.022727 units. Clearly label hypothetical probabilities as illustrative.

## 7. Statistical baseline and evaluation contract

### Proposed baseline experiment

Use pregame team strength, home/neutral status, and rest derived only from prior games. Start with a simple regularized margin model and a separate total model; establish a schedule/results baseline before adding richer play-by-play features. Fit opponent effects with regularization rather than use a team's raw win percentage as its probability. Compare against simple historical/home baselines and comparable no-vig market probabilities where genuine historical prices exist.

Candidate extensions: rolling offensive/defensive EPA per play and success rate, with documented exclusions, opponent adjustment, shrinkage, and season transitions. Select additions by chronological validation, not persuasive football stories. Injuries and weather remain scenario/context evidence until there are defensible point-in-time numeric features and evaluated effects. Do not turn AI text into arbitrary point adjustments.

A margin or total mean alone does not give cover probability. Use an explicit predictive distribution, initially a smoothed empirical residual distribution from training-only out-of-fold predictions. Integrate it into integer-point bins to retain push/tie mass. Use the same margin distribution for compatible moneyline and spread outcomes; total has its own distribution. Evaluate support/tail handling and avoid silently renormalizing away pushes. These are baseline approximations, not a claim that NFL scores are normally distributed or that a simple Poisson model is adequate.

### Reproducible experiment

1. Record downloaded file hashes, source versions, feature definitions, game cutoffs, seeds and fit parameters.
2. Split by date/season. Use expanding training windows with an inner chronological validation window; hold out later seasons untouched for final assessment. No random game-row split.
3. Fit preprocessing, regularization, residual distributions, and any calibration on training/validation data only. A calibration model needs its own held-out predictions, not in-sample targets.
4. Use a local fit/evaluation script producing a small JSON artifact consumed by the application. Keep baseline inference and evaluation definitions shared where possible. A new Python runtime is unnecessary initially; if fitting libraries force a separate runtime, document the dependency before introducing it.
5. Report Brier/log loss, calibration bins with counts, error by market and probability band, baseline comparisons, coverage, and missing data. Include no-vig market comparison only on the subset with genuinely comparable odds.
6. Assess hypothetical unit returns only at timestamped prices actually present in the evaluation data. Closing prices cannot stand in for an earlier offer. Report ROI and uncertainty, selection counts, season variation, and correlated outcomes; group uncertainty resampling by game/week rather than pretend every market is independent.
7. Freeze feature selection and the decision policy before prospective evaluation. Save all runs; define a primary eligible decision per offer/game/cutoff policy so repeated refreshes cannot inflate the sample. Include an all-runs descriptive view separately.
8. Keep findings experimental unless probability quality and prospective evidence justify a stronger claim. A positive ROI over a small sample or favorable closing-line movement alone is insufficient.

### Recommendation policy

The numerical policy is deterministic and versioned. Require valid rules/prices, no started game, appropriate source coverage, a released experimental artifact, and an uncertainty assessment before presenting an experimental value candidate. Otherwise show wait/pass/insufficient evidence with the precise reason.

Select any value threshold on inner validation data and freeze it before the held-out/prospective period. Report sensitivity to plausible probability errors and material information changes. Positive point-estimate EV is not proof of a positive true edge. Do not set an arbitrary percentage threshold in this document and describe it as scientifically established. If uncertainty cannot be quantified credibly, state it and retain experimental labeling.

Closing-line comparison is optional and requires a captured comparable closing offer. Comparing the price of -3 with -3.5 as if it were the same contract is invalid. Keep line movement and price movement separate; absent closing data is unavailable, not zero CLV.

## 8. AI and cost controls

Providers: TheClawBay at the confirmed `/v1` base, and direct DeepSeek. Refresh their model catalogs through their documented endpoints. Show all returned catalog entries, but only compatible text-capable models may generate theses; unsupported entries display a reason. Prefer `grok-4.7` when available. Record model ID and returned version metadata; model IDs can remain stable while upstream behavior changes.

Store keys in private environment configuration. Settings selects provider/model and tests availability explicitly; key entry in a database-backed web form is unnecessary initially. Do not silently fall back or call several models to vote. Cache reports, set input/output limits, record returned token usage, and show unknown costs as unknown. Provider-side allowances control spending; a browser subscription is not presumed to include API requests. No search tool is presumed free or available through a proxy.

Build the first report from an immutable evidence packet plus precomputed values. Require structured claims referencing evidence IDs. Reject unknown IDs, altered calculations, unsupported numerical probabilities, and invalid schemas. Preserve raw model output privately for diagnosis within a bounded retention policy, with secrets excluded. One bounded repair attempt may fix formatting; otherwise mark drafting failed and preserve the evidence and calculations.

Treat fetched text as data. Provider calls do not execute arbitrary instructions found in articles. Fetch only approved public-source origins initially; resolve redirects with the same restrictions and reject private-network destinations. Do not assume valid-looking citations establish support: make excerpts visible for the user's inspection.

## 9. Implementation tasks

These tasks are dependency-ordered. Each numbered action is a small reviewable step; each task's final checkpoint is a potential commit once a Git repository exists. Do not run these commands as part of the planning deliverable. At implementation, consult current CLI help before scaffolding; the commands below define the intended project scripts and checks.

### Task 1: Prove the toolchain

**Create:** `package.json`, lockfile, `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `src/routes/+page.svelte`, `src/routes/+page.server.ts`, `tests/smoke.test.ts`, `.gitignore`, `.env.example`.

1. Inspect Node/npm versions and current Vite+/Svelte scaffolding help; pin mutually compatible releases. Generate in a temporary directory first to preserve existing guidance and research.
2. Copy only the scaffold files needed for a single SvelteKit app. Configure the Node adapter, local host, Svelte checking, and Vite+.
3. Add one server action returning a fixture game name and one test that checks its observable output.
4. Define scripts `dev`, `check`, `test`, `build`, and later `test:e2e`. `check` runs Vite+ checks plus `svelte-check`; `test` is non-watch mode.
5. Run `npm run check`, `npm test`, `npm run build`; manually load the local production server and submit the action. Record versions and any compatibility limitation before proceeding.

Verified 2026-10-25 on Node 24.15.0. The current SvelteKit 3 project has no `svelte.config.js`: the Node adapter and SvelteKit options live in `vite.config.ts`, as documented by the current project structure. All other listed Task 1 files exist. No Git repository exists yet, so this checkpoint is not committed.

**Exit:** local production page/action, test, and build work together. No model calls or data promises yet.

### Task 2: Implement market mathematics

**Create:** `src/lib/domain/offer.ts`, `odds.ts`, `probability.ts`, `settlement.ts`, and adjacent `*.test.ts`.

1. Write failing behavior tests for positive/negative prices, opposite-side comparability, no-push and push EV, selected-team spread orientation, totals, moneyline ties under saved rules, voids and invalid inputs.
2. Run `npm test -- src/lib/domain` and confirm the intended failures.
3. Implement pure functions and boundary schemas. Use explicit market variants so a moneyline cannot accidentally require a spread or omit tie rules.
4. Add tests for -150/+130 normalized market probabilities, one-price unavailable state, and the worked examples above. Check round-trip American/decimal conversion within documented tolerance.
5. Run the targeted tests and `npm run check`; save a reviewable checkpoint.

**Exit:** independently verifiable calculations with no AI dependency.

### Task 3: Add persistence and immutable snapshots

**Create:** `migrations/001_initial.sql`, `src/lib/server/db/client.ts`, `repository.ts`, `scripts/migrate.mjs`, `tests/integration/journal.test.ts`.

1. Configure a user-owned Neon Free development connection without logging credentials; do not change a paid organization or apply migrations to unrelated databases.
2. Write a transaction test: save offer/evidence/run, save a refresh, then verify the original is unchanged and both are retrievable.
3. Implement constraints and repository operations for the records above. Save related completion records in one transaction.
4. Define `npm run db:migrate` and `npm run test:integration` against an explicitly designated disposable database; no destructive reset command by default.
5. Exercise immutable snapshots, failed writes, duplicate submissions, and journal export. Verify secrets do not appear in serialized records.

**Exit:** reliable audit trail before generating recommendations.

### Task 4: Establish free-source adapters

**Create:** `src/lib/server/sources/{contracts,nflverse,injuries,weather,manual}.ts`, `scripts/data/import.ts`, `tests/fixtures/sources/`, `data/README.md`.

1. Download a small actual current-season schedule sample. Confirm game IDs, kickoff, team aliases, venue and expected fields; retain a minimized fixture and checksum.
2. Verify injury source contents and timestamps separately; a published update schedule alone is not proof of current rows. Implement manual fallback if the live feed cannot be verified.
3. Verify venue coordinates/roof state and the relevant weather endpoint. Unknown roof/weather relevance stays visible. Scope non-US games explicitly; manual weather evidence is acceptable when the chosen public API has no coverage.
4. Write fixture tests for schema changes, old data, missing publication time, a source timeout, and conflicting manual/source observations.
5. Implement normalized evidence, fetch limits, source health, explicit missing states, caching and no-future-data checks. Define `npm run data:import` with documented options.

**Exit:** a real future game's evidence packet can be assembled with coverage warnings and no AI. General search is optional, not required to pass.

### Task 5: Add provider settings and a checked thesis

**Create:** `src/lib/server/providers/{contracts,theclawbay,deepseek}.ts`, `src/lib/server/analysis/{packet,report-schema,report-validation}.ts`, Settings routes, provider fixtures/tests.

1. Write fixture tests for model discovery, incompatible catalog entries, auth/rate-limit errors, missing usage, malformed reports, and invented evidence IDs.
2. Implement discovery and provider-specific transport. Persist the selected non-secret model configuration and catalog time.
3. Create the evidence-only report prompt and schema. Check returned source references and numerical fields against deterministic inputs.
4. With locally configured credentials, explicitly test discovery, then one bounded thesis request. Record actual capability results; do not assume every model supports identical parameters.
5. Verify a failed model request still exposes saved evidence/calculations; preserve errors without revealing keys. Run targeted tests and checks.

**Exit:** a sourced research thesis from the selected model, still without unsupported probability claims.

### Task 6: Complete the first user workflow

**Create:** Analyze, saved-analysis, Journal, Handbook routes; `src/lib/server/analysis/run.ts`; `tests/e2e/research-flow.spec.ts`; `playwright.config.ts`.

1. Build the game/offer form with explicit home/away, full-game rules, required market fields and optional initial lean.
2. Wire the persisted lifecycle, progress polling, independent evidence packet, checked report and version history. Preserve interrupted tasks after restart.
3. Add journal filtering, actual-bet recording and manual resolution with a correction trail; add handbook links at relevant calculations.
4. Write a browser scenario using fixtures: enter offer, hide initial lean from model, analyze, inspect sources, refresh changed price, and confirm old report unchanged.
5. Run `npm run test:e2e`, then perform one live future-game walkthrough. Record which sources were automatic/manual and the report's limitations.

**Exit:** Milestone B. The user can use the app for sourced research while model development proceeds.

### Task 7: Fit and evaluate the baseline

**Create:** `src/lib/server/models/{features,distribution,predict,artifact}.ts`, `scripts/model/{fit,evaluate}.ts`, `tests/model/`, `docs/research/model-evaluation.md`.

1. Create synthetic dated games proving a future outcome cannot alter an earlier feature row; test score-bin probabilities and push/tie handling.
2. Implement prior-game feature construction, transparent margin/total fitting, and training-only residual distributions; record every feature/fit choice.
3. Define `npm run model:fit` and `npm run model:evaluate` with explicit dataset and split manifests. Emit versioned local artifacts with checksums and small evaluation summaries.
4. Run chronological experiments and baseline comparisons described in section 7. Document unavailable historical odds or injury/weather evidence instead of manufacturing tests.
5. Write the evaluation report including negative results, calibration counts, uncertainty, coverage and reproducibility commands. Keep unreleased artifacts out of the recommendation path.

**Exit:** artifact probabilities are reproducible and their limitations visible; no claim of profitability is required.

### Task 8: Add experimental value assessment

**Create:** `src/lib/server/analysis/policy.ts`, `src/lib/domain/sensitivity.ts`, policy tests; extend report and analysis routes.

1. Write decision tests for invalid offer, started game, stale/missing material evidence, unreleased model, uncertain value, wait and pass.
2. Implement versioned policy and sensitivity calculations. Apply market rules and use a price cutoff only when the model provides the necessary probabilities.
3. Inject frozen model results into the evidence packet; ensure AI can explain but cannot change probabilities, eligibility or conclusion.
4. Add a browser test proving worse odds or missing material evidence changes the applicable conclusion and that reruns preserve old results.
5. Show experimental labeling, method, artifact and evaluation links in every numerical report.

**Exit:** Milestone D, with no unsupported claim of validated edge.

### Task 9: Prospective tracking and reliability

**Create:** `src/lib/server/analysis/settle.ts`, `scripts/journal/export.ts`, `scripts/model/prospective-report.ts`, operational documentation and focused tests.

1. Save the prospective selection policy and evaluation start time before outcomes; distinguish primary analysis and later refreshes.
2. Implement settlement import/review, separate system and actual-bet results, unresolved/void states and comparable closing-offer capture when available.
3. Test a push, postponement, duplicate settlement, correction, interrupted run, unavailable provider, changed source schema and Neon write failure.
4. Export and restore a small journal sample; keep full source caches out of Neon. Document local start/stop, backup, key configuration and recovery.
5. Run `npm run check`, `npm test`, `npm run test:integration`, `npm run test:e2e`, `npm run build`; inspect one exported report for secrets and broken source references. Do not run live paid calls in automated tests.

**Exit:** an auditable personal experiment with a recovery path. Evaluate expansion after sufficient prospective evidence; elapsed development time does not establish an edge.

## 10. Decisions to resolve through evidence

These do not reopen settled product choices or block delivery of the research workflow:

- Exact tool versions and whether selected SvelteKit/Vite+ releases pass the smoke build.
- Actual account model availability, protocol capabilities, and included AI/search allowance.
- Current free-source schemas, data freshness, injury coverage and any historical snapshot gaps.
- Fitted coefficients, training windows, calibration choices, and value threshold; freeze evaluated choices in artifact/policy manifests.
- Whether a numerical model adds useful information beyond simple or market baselines. A negative finding is an acceptable research result.

Task 1 is verified. The next implementation action is Task 2.
