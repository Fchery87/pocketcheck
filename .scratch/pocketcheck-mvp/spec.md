# PocketCheck personal NFL research MVP

Status: ready-for-agent
Type: task
Scope confirmed by the user: 2026-10-25.

## Problem Statement

The user is learning sports betting handicapping and needs a consistent way to research a particular bet, understand its mathematics, and compare an independent assessment with their own reasoning. Statistics, availability reports, weather, sportsbook prices, and commentary are scattered across sources and can change before kickoff. A persuasive explanation or a likely game winner does not establish that a specific offer has positive expected value.

The user needs to understand what supports a recommendation, what contradicts it, which assumptions it depends on, and whether the reasoning holds up over time. They want free sports data and infrastructure allowances, supplemented by their existing AI services, without silently introducing paid feeds or unsupported certainty.

## Solution

Build PocketCheck as a personal, locally accessed NFL pregame research application using SvelteKit, Vite+, and Neon. The user selects a game and records an exact full-game moneyline, spread, or total from their sportsbook. PocketCheck gathers available evidence, accepts manual supplements, calculates the price mathematics, and produces a sourced betting thesis or an explicit pass, wait, or insufficient-evidence conclusion.

The thesis presents supporting and opposing evidence, source times, assumptions, uncertainty, and conditions that would change the conclusion. The user can record their initial lean before seeing the system's independent assessment. A journal preserves the original offer, evidence, report versions, and subsequent results, with actual bets tracked separately in units.

Deliver the research workflow first. Add experimental win, loss, and push probabilities through a transparent statistical baseline with chronological evaluation. AI explains supplied evidence and model outputs; it cannot manufacture probabilities or substitute fluent prose for a tested method. A handbook teaches the fundamentals and formulas alongside the workflow.

## User Stories

1. As a personal bettor, I want to use PocketCheck locally in my browser, so that I can research games without deploying a public service.
2. As a personal bettor, I want NFL to be the first supported sport, so that the research method can be evaluated within a focused scope.
3. As a personal bettor, I want to select a scheduled matchup with its date, kickoff, timezone, venue, and home and away teams, so that I analyze the correct event.
4. As a personal bettor, I want to select a full-game moneyline, point spread, or game total, so that the analysis answers the specific betting question I have.
5. As a personal bettor, I want to record my sportsbook, selection, point line when applicable, and American odds, so that the thesis evaluates my actual offer.
6. As a personal bettor, I want to record when I observed the offer separately from when I entered it, so that the report does not imply an old price is still available.
7. As a personal bettor, I want to record the market's overtime, tie, push, and void rules, so that calculations and results reflect the contract I am evaluating.
8. As a personal bettor, I want to enter the opposing price when available, so that the app can estimate market margin using comparable outcomes.
9. As a personal bettor, I want clear feedback for missing or incompatible market inputs, so that I can correct an offer before research begins.
10. As a personal bettor, I want to record an optional initial lean and rationale before seeing the system's conclusion, so that I can compare independent reasoning.
11. As a personal bettor, I want my initial lean excluded from the system's evidence packet, so that my preferred answer does not steer its assessment.
12. As a personal bettor, I want research to begin only when I request it, so that I control when source and AI requests occur.
13. As a personal bettor, I want visible analysis progress and a saved failure or interruption state, so that I understand whether research completed and can retry deliberately.
14. As a personal bettor, I want the app to gather free public statistics and official context where reliable access exists, so that I can reduce repetitive research.
15. As a personal bettor, I want to supply dated manual evidence when an automatic source is unavailable, so that a missing integration does not prevent useful research.
16. As a personal bettor, I want each fact to identify its source, collection time, and publication or effective time when known, so that I can judge relevance and freshness.
17. As a personal bettor, I want missing, stale, and conflicting evidence to remain visible, so that I can distinguish a research gap from an established fact.
18. As a personal bettor, I want team performance metrics to state their definitions, sample sizes, and games included, so that I can compare like with like.
19. As a personal bettor, I want quarterback and other material availability questions identified explicitly, so that unresolved lineup assumptions do not become false certainty.
20. As a personal bettor, I want weather evidence to apply to the venue, kickoff period, and roof conditions, so that irrelevant forecasts do not influence the thesis.
21. As a personal bettor, I want the report to show decimal odds and the applicable break-even probability, so that I understand what my offered price requires.
22. As a personal bettor, I want margin removal identified as an assumption-based market estimate, so that I do not mistake it for an independently established probability.
23. As a personal bettor, I want market-margin calculations omitted when complementary prices are unavailable, so that the app does not invent missing inputs.
24. As a personal bettor, I want win, loss, and push probabilities only when a specified statistical method supplies them, so that numerical recommendations are traceable.
25. As a personal bettor, I want expected value calculated from the recorded price and applicable outcome probabilities, so that value remains tied to the actual offer.
26. As a personal bettor, I want a concise conclusion with a full supporting thesis, so that I can understand both the recommendation and its reasoning.
27. As a personal bettor, I want the strongest opposing evidence and counterargument, so that I can challenge the thesis before acting.
28. As a personal bettor, I want verified facts distinguished from interpretations, assumptions, market estimates, and model estimates, so that I know the basis of each claim.
29. As a personal bettor, I want pass, wait, and insufficient-evidence outcomes, so that the app does not force a pick when support is inadequate.
30. As a personal bettor, I want probabilities and value assessments labeled experimental while their reliability is unresolved, so that I do not confuse a research result with a proven edge.
31. As a personal bettor, I want the report to state what price or material news would change its conclusion, so that I can recognize when it no longer applies.
32. As a personal bettor, I want sensitivity to uncertain assumptions shown where supported, so that I can see how fragile an estimated advantage may be.
33. As a personal bettor, I want to refresh research explicitly and compare report versions, so that I can understand how new prices or evidence affected the conclusion.
34. As a personal bettor, I want original prices, evidence, calculations, and reports preserved, so that later updates cannot rewrite the past record.
35. As a personal bettor, I want TheClawBay available with Grok 4.7 preferred when my account supports it, so that I can use my chosen AI service.
36. As a personal bettor, I want direct DeepSeek available as a separate provider, so that I can choose between my existing services.
37. As a personal bettor, I want settings to display each provider's discovered models and compatibility, so that I can select an available thesis-generation model.
38. As a personal bettor, I want to refresh the model catalog and see when it was retrieved, so that settings reflect changing provider availability.
39. As a personal bettor, I want unavailable or incompatible models explained without a silent provider switch, so that I retain control over the service making requests.
40. As a personal bettor, I want API credentials kept private and excluded from reports and exports, so that using my services does not disclose access keys.
41. As a personal bettor, I want AI request limits and reported usage visible where available, so that I can manage my existing allowance without assumed free inference or search.
42. As a personal bettor, I want evidence and deterministic calculations retained when AI drafting fails, so that completed research remains useful.
43. As a personal bettor, I want invented citations and altered numerical outputs rejected, so that unsupported AI output cannot become a completed thesis.
44. As a personal bettor, I want every completed analysis, including passes, in the journal, so that the system's record does not select only attractive outcomes.
45. As a personal bettor, I want to record whether I actually placed a bet and at which price and stake in units, so that my choices remain distinct from system recommendations.
46. As a personal bettor, I want results recorded as win, loss, push, void, or unresolved under the saved rules, so that performance reflects actual settlement behavior.
47. As a personal bettor, I want settlement corrections to preserve their reasons and history, so that the journal remains auditable when a source or entry changes.
48. As a personal bettor, I want separate summaries for system assessments and actual bets, so that I can evaluate the tool and my decisions independently.
49. As a personal bettor, I want missing closing prices and unresolved results shown as unavailable, so that absent data does not become a misleading zero.
50. As a personal bettor, I want optional closing-offer comparisons only for compatible markets, so that line movement and price movement are not conflated.
51. As a personal bettor, I want historical evaluation to use earlier information and chronological holdouts, so that future outcomes cannot leak into reported performance.
52. As a personal bettor, I want probability quality, calibration, baseline comparisons, coverage, and uncertainty reported, so that win rate alone does not determine trust.
53. As a personal bettor, I want hypothetical historical returns calculated only from available timestamped prices, so that a backtest does not assume offers I could not have received.
54. As a personal bettor, I want prospective assessments saved before kickoff under a frozen evaluation policy, so that live research can be evaluated honestly.
55. As a personal bettor, I want repeated refreshes distinguished from the primary eligible assessment, so that multiple versions of one bet do not inflate performance samples.
56. As a learner, I want a handicapping handbook with worked formulas and NFL research definitions, so that I understand the reasoning behind the app.
57. As a learner, I want explanations linked to the report's calculations and common analytical mistakes, so that I can improve my own research while using the tool.
58. As a personal bettor, I want free-source and infrastructure limits exposed without automatic upgrades or purchases, so that the project respects my budget constraint.
59. As a personal bettor, I want large public datasets kept locally and compact records stored durably, so that the journal fits within free infrastructure allowances.
60. As a personal bettor, I want to export and recover my saved journal, so that a local failure or free-service interruption does not erase my research history.

## Implementation Decisions

### Application and delivery

- Use one local SvelteKit application with TypeScript and Vite+, a Node server runtime, and Neon Postgres. Preserve the existing toolchain scaffold. Bind local servers to the loopback interface; public deployment requires a separate design review.
- The current scaffold contains a fixture game page, a server load/action, and a Vite+ smoke suite. Project records document a successful toolchain proof. No database, live research source, or AI provider is connected yet. Do not represent the research workflow as implemented.
- Organize the application around Analyze, saved analysis/version history, Journal, Handbook, and Settings. Only NFL is supported in the initial UI.
- Deliver a working research workflow before the statistical baseline and numerical value policy. An evidence-based report without a numerical edge can be a valid first milestone.
- Keep source ingestion, provider access, deterministic domain calculations, persistence, run coordination, statistical inference, and evaluation as explicit module boundaries. Avoid additional runtime services unless measured needs justify them.

### Offers, inputs, and calculation contracts

- An offer identifies a canonical game, sportsbook, full-game market, selection, applicable point line, American price, observation time, entry time, and settlement rules. Home/away assignment and selected-team line orientation are explicit.
- Model moneyline, spread, and total as distinct market variants. Validate user and external inputs at boundaries; reject nonfinite or invalid prices, missing required fields, incompatible opposing prices, and games that have already started.
- Complementary prices must refer to the same game, line, period, rules, sportsbook, and comparable observation time before estimating a single market's margin. A one-sided price supports break-even arithmetic but does not supply a complete de-vig estimate.
- Deterministic code owns odds conversion, conditional and unconditional break-even treatment, assumed margin removal, expected value, supported price thresholds, settlement, unit returns, and performance metrics. Push and void handling must be explicit.
- Expected value requires a supplied probability method. Missing probability or EV is unavailable, not zero. Worked hypothetical examples belong in learning material and tests, never as evidence of a current opportunity.

### Research and immutable records

- Use audited public NFL datasets and official reports where access and current payloads are verified. Keep a manual supplement path for injuries, weather, context, or game details when automatic coverage fails. Do not make unverified general web search a required production dependency.
- Every evidence item records a source reference, retrieval time, known publication/effective time, normalized facts or permitted excerpt, manual/automatic origin, and version/checksum where applicable. Unknown publication time remains unknown.
- Establish a decision cutoff per run and freeze its offer, evidence packet, calculations, provider/model, prompt/report schema, model artifact, and policy versions. A refresh creates a new run linked to its predecessor.
- Exclude the optional initial user lean from the independent system evidence packet. Reveal the comparison after the system report is available.
- Preserve schedule changes, evidence conflicts, missing inputs, and data freshness assessments. Version freshness policy according to source cadence and the decision being made; no arbitrary universal expiry is established by this spec.
- Persist canonical games, immutable offers, evidence, runs and their evidence associations, predictions, validated reports, original user research, actual bets, settlements/corrections, model metadata, and non-secret settings.
- Keep large public source downloads and reproducible model artifacts on the user's computer. Store compact records, hashes, selected evidence, report versions, and journal data in Neon. Export and recovery must preserve relationships and original timestamps.
- Separate run lifecycle from research conclusion. Persist pending/running/completed/failed/interrupted state; a completed report may recommend passing. Allow one active analysis initially, bound external operations, and prevent duplicate submissions from causing duplicate billable calls.
- After a process restart, expose abandoned runs as interrupted and require an explicit retry. Preserve existing records when source access, AI access, or Neon writes fail.

### Thesis and provider contracts

- The thesis identifies the exact offer and decision time, deterministic price mathematics, sourced supporting and opposing evidence, assumptions, method, uncertainty, missing inputs, and conditions that would change the conclusion.
- Permit pass, wait, insufficient evidence, experimental lean, and experimental value candidate. The versioned application policy owns numerical eligibility and the final policy conclusion; AI may explain those decisions but cannot override them.
- TheClawBay uses the user-confirmed base URL https://api.theclawbay.com/v1 and prefers the model identifier grok-4.7 when returned by the user's account. Direct DeepSeek is a separate provider connection. Do not equate its account access with DeepSeek models available through TheClawBay.
- Discover provider model catalogs through documented model-list endpoints, cache their retrieval times, and support explicit refresh. Display all returned entries; incompatible entries remain visible with a reason and cannot generate theses. Discover or test capability rather than infer protocol, tool, or structured-output support from a model name.
- Use a small provider contract for model discovery and evidence-to-thesis generation with provider-specific transport and response parsing. Record actual account/model capability status and returned usage metadata when available.
- Keep API keys in private server-side environment configuration. Settings stores provider/model choices and non-secret metadata; browser state, durable reports, logs, and exports must not contain keys.
- Use bounded requests and explicit model selection. Do not silently fall back, fan out to several models, buy credits, assume prepaid allowance, or enable separately billed search. Unknown usage cost remains unknown; provider-side limits are authoritative for spending.
- Submit an immutable evidence packet with precomputed values. Validate structured claims and references against evidence supplied to that run; reject invented source IDs, altered computations, and unsupported probabilities. Limit formatting repair attempts; preserve evidence and calculations after a drafting failure.
- Treat source text as untrusted data. Use approved public-source origins, restrict redirects and private-network targets, and prevent retrieved instructions from changing policy or accessing credentials. Valid source IDs alone do not prove a claim is supported; make supporting excerpts available for inspection.

### Statistical evaluation and recommendation policy

- Begin with a transparent prior-games baseline for margin and total, using regularized team/opponent effects and declared home/rest context. Add richer efficiency features only when chronological evaluation supports them.
- Derive probabilities from an explicit predictive distribution, with integer outcome mass for ties and pushes. A predicted mean margin or score alone does not supply cover probability. Keep moneyline and spread outcomes consistent with the same margin distribution where rules permit.
- Preserve feature definitions, dataset hashes, included games, training cutoff, preprocessing, fitted coefficients, distribution method, calibration, seed/configuration, and artifact version. Store artifacts so inference and evaluation are reproducible.
- Use chronological training and validation plus untouched later holdouts. Fit feature selection, preprocessing, calibration, thresholds, and uncertainty policy without inspecting held-out outcomes. Current injury reports, revised forecasts, final-season aggregates, and retrospective AI research cannot recreate past pregame evidence.
- Document limitations of corrected historical datasets and upstream model training. Exclude features lacking a defensible historical availability rule from point-in-time claims.
- Evaluate market-specific probability quality, calibration with sample counts, baseline comparisons, coverage, and uncertainty. Score push-capable markets with a declared multiclass or conditional decisive-result method.
- Historical return studies require actual timestamped comparable prices. Missing price provenance limits the study; closing prices cannot stand in for earlier executable offers.
- Freeze prospective selection policy before observing results. Identify a primary eligible assessment per offer/game/cutoff policy; retain other refreshes in a separate all-runs view. Account for shared-game or slate dependence when assessing uncertainty.
- Numerical value candidates require valid inputs/rules, appropriate evidence coverage, a released experimental artifact, and an explicit uncertainty assessment. Thresholds must be evaluated and versioned rather than selected for persuasive output. Retain experimental labeling when evidence is insufficient to establish an advantage.
- Research conclusions are hypotheses. Positive point-estimate expected value, favorable closing movement, or a short profitable sample does not establish a reliable edge.

### Journal, settlement, and education

- Automatically retain all completed assessments, including passes. Track actual bet placement, price, time, stake in units, and results separately; do not infer that the user bet because the system generated a candidate.
- Settle under the original market rules as win, loss, push, void, or unresolved, with an identifiable source. Preserve reasons and history for corrections, postponements, and cancellations.
- Document ROI denominators and push/void treatment. Show unresolved results and unavailable comparisons explicitly; do not combine all refreshes into a purported independent performance sample.
- Closing-line comparison is optional and requires a comparable captured closing offer. Report point-line and price movement separately. A manually entered final quote is not automatically a market-wide closing reference.
- Include a handbook explaining handicapping, NFL research factors and metric definitions, odds and margin mathematics, EV, pushes, uncertainty, calibration, leakage, and worked examples. Kelly may be discussed as educational context only; personalized stake recommendations remain outside scope.

## Testing Decisions

- **User-confirmed primary seam:** test the observable browser workflow from offer entry through saved thesis, refresh/history, journal, and result review. The user explicitly accepted this approach during specification synthesis. Prefer this seam over separately mocking each internal module.
- **Test quality:** assert user-visible outcomes and public calculation/persistence contracts. A good test fails when a price is misinterpreted, evidence is lost, a report invents support, an old run changes, or performance is misreported. Avoid assertions about private helper calls, internal layout, or implementation structure.
- **Existing prior art:** the scaffold has a Vite+ smoke suite exercising a fixture server load and action and checking the returned game name. This establishes the framework test runner and server-facing precedent, not proof of the research workflow. No browser, database, source-ingestion, AI, or model-evaluation suites currently exist.
- **Browser acceptance coverage:** enter a future game and valid offer, record an optional lean, analyze with controlled source/provider responses, inspect citations and missing evidence, compare the independent conclusion with the lean, refresh at a changed price, and confirm the prior report remains unchanged. Record an actual bet separately and inspect its settlement.
- **Calculation tests:** verify positive/negative odds conversions, decimal round trips, no-push and push EV, conditional break-even, complementary-market checks, margin-estimate assumptions, spread sign conventions, totals, tie rules, unit returns, and unavailable denominators against independently worked examples. Include invalid numeric input and boundary cases.
- **Persistence integration tests:** use a real explicitly designated disposable Postgres database for save/read transactions, immutable refresh versions, duplicate submissions, settlement corrections, journal separation, export/restore, and failed writes. Never reset an unrelated database or weaken immutability to simplify tests.
- **External-service control:** replace paid or nondeterministic network responses at source/provider boundaries with small documented payload fixtures. Run application logic, calculations, and persistence for real. Exercise stale data, missing fields, changed schemas, source conflicts, auth/rate-limit errors, malformed reports, incompatible models, removed models, invented citations, altered numerical outputs, and missing usage metadata.
- **Live integration checks:** separately verify a current NFL evidence sample, a permitted manual fallback, authenticated model discovery, and an explicitly initiated bounded thesis request using locally configured credentials. Automated suites must not make paid AI calls. Document sampled versus unverified capabilities.
- **Model tests:** use dated synthetic games to prove later outcomes cannot alter earlier features; verify probability mass, ties/pushes, cutoff enforcement, artifact reproducibility, and market-specific scoring behavior. Evaluate real historical data with chronological splits and record negative results and missing price coverage.
- **Failure and recovery coverage:** verify interrupted-run recovery, safe explicit retries, source/AI unavailability, exhausted infrastructure allowance, unsupported settlement rules, no silent provider switching, and retention of usable evidence after drafting failure.
- **Privacy and report checks:** inspect rendered reports and exports for credentials; reject fabricated source references and model-authored probability substitutions. Test that the user's original lean is absent from the independent evidence packet.
- **Verification gates:** retain Svelte/type checks, a production build, the existing smoke suite, targeted domain tests, database integration tests, and browser acceptance tests as the relevant modules are implemented. The current end-to-end command is a placeholder and must be replaced with a real suite before claiming browser coverage.

## Out of Scope

- Public deployment, multi-user authentication, subscriptions, customer billing, shared picks, and commercial tipster services.
- Automatic sportsbook login, bet placement, wallet access, or verification that a manually entered price remains executable.
- Live/in-play betting, player props, parlays, same-game parlays, teasers, futures, alternate lines, and partial-game markets.
- NBA, college football, college basketball, and MLB implementations in the first release. Their future methods and data audits must be sport-specific.
- Personalized dollar stakes, bankroll optimization, automated Kelly staking, or automated betting execution.
- Paid sports data subscriptions, automatic account upgrades, credit purchases, or assumed free general web search.
- Guaranteed profit, guaranteed accuracy, forced picks, invented confidence percentages, or marketing a model as validated before evaluation supports the claim.
- A complete reconstructed historical archive of every sportsbook quote, injury update, news article revision, or forecast. Historical claims must reflect verified coverage.
- Cross-model voting, autonomous multi-model research loops, vector databases, distributed queues, a separate Python service, and a monorepo unless later evidence justifies expanding the architecture.
- Team-logo assets, proprietary paid grades, bulk article republication, access-control bypasses, and a critical dependency on undocumented third-party endpoints.

## Further Notes

- The project currently has a local toolchain scaffold and a research/implementation plan. This specification consolidates the agreed product requirements; it does not certify unimplemented research, data, AI, or model capabilities.
- The $0 requirement applies to additional data and infrastructure costs within free allowances. The user supplies existing TheClawBay and DeepSeek access. Included API inference/search, remaining balance, account entitlements, and rate limits require verification before enabling calls.
- Current source payloads, injury coverage, timestamp semantics, publication history, and the exact free infrastructure allowances remain implementation-time checks. A source's documentation or loader does not prove its current payload is complete.
- Research and source feasibility precede dependent functionality. The first delivery is a useful sourced research journal; the next delivery adds evaluated experimental numerical recommendations and prospective tracking. Finding no betting advantage is an acceptable research outcome.
- The existing implementation plan describes the ordered tasks. The next planned implementation step is market mathematics; this spec publication does not itself start implementation.
- Freshness limits, fitted coefficients, calibration choices, value thresholds, and release criteria must be justified and recorded during evaluation, not silently invented by an implementing agent.
- Supporting documents: [implementation plan](../../docs/plans/2026-10-25-pocketcheck-implementation.md), [handicapping handbook](../../docs/research/2026-10-25-handicapping-fundamentals.md), [free NFL data audit](../../docs/research/2026-10-25-free-nfl-data-audit.md), and [stack and AI feasibility](../../docs/research/2026-10-25-stack-and-ai-feasibility.md).

## Comments

- 2026-10-25: Consolidated the confirmed interview decisions, research findings, implementation plan, and current scaffold into this specification. Published to the project's local issue tracker with Status: ready-for-agent.
- 2026-10-25: User confirmed browser-workflow acceptance tests with focused calculation tests and controlled external-service responses as the testing approach.
