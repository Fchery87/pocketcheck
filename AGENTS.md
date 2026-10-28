# PocketCheck

Personal NFL pregame research journal. The record is the product: an analysis, a placed bet, and a model forecast stay distinguishable after kickoff.

## Reach first

- Read `docs/agents/issue-tracker.md` before creating or fetching an issue or spec. Issues live in `.scratch/<feature>/`.
- Read `docs/agents/triage-labels.md` before triaging an issue.
- Read `docs/agents/domain.md` before exploring the codebase.
- Read `DESIGN.md` before changing any page, component, or style.
- Read `README.md` before describing what the application does. Read `docs/testing.md` before running or changing verification. Read `.scratch/pocketcheck-trust-and-journal/spec.md` before changing the journal journey.

## Journal

Keep these records separate. Do not copy one into another to fill a gap.

- The analysis snapshot freezes the game, research offer, decision cutoff, evidence, gaps, model identity, and policy result. A later schedule update changes discovery only.
- A refresh links to its parent and may change the point line, sportsbook, odds, and observation time. It keeps the market and selection. A different market or selection is a new analysis.
- The private lean stays outside the evidence packet and thesis.
- The actual bet stores its own contract, placement time, stake units, and submission identifier. It can differ from the researched offer.
- A settlement notice is append-only. A correction is a new notice that names the earlier one. Grades use the contract being graded.
- A comparable close is the same market, side, point line, sportsbook, and rules, observed later. A different line is line movement, not an odds change.
- A game board is separate from an analysis snapshot. It freezes both sides of moneyline, spread, and total. Do not copy a board into an analysis or the reverse.
- A model pick names a side and a strength grade (strong, lean, no edge). The forecasting model chooses the side. The drafter only explains the frozen pick and cannot change the side, grade, or numbers. A contradicting explanation fails visibly and the pick is kept.
- Assessment performance counts frozen primary assessments. Actual-bet performance counts placed contracts. Model-pick performance counts frozen primary model picks. A refresh is not another primary observation.
- The primary is the earliest completed analysis whose cutoff is strictly before kickoff, frozen when that attempt finishes. One game has one primary. Ties stay a single primary. Rows without a proven pre-outcome completion stay unclassified.
- The primary model pick is the earliest completed model pick for a game and market whose cutoff is strictly before kickoff, frozen when that board finishes. One game and market has one primary model pick. Refreshes are not primary. Its forecast stays frozen under the prospective protocol and is not regenerated.
- Settlement grades a model pick from the picked side's contract. A pick bet is graded from the placed contract, which can differ.
- Legacy snapshots are `legacy-unknown`. Legacy bets without their own contract say the terms were not recorded. Do not backfill a kickoff, venue, line, starter, publication time, or any other fact the saved record cannot establish.
- Unknown cost, an unresolved result, and a missing close stay unavailable. A push or void returns stake and leaves the return denominator. Do not render any of these as zero.
- Provider accounting sums the original draft and every repair. A missing field stays unknown and the total is partial. An ambiguous provider outcome needs a deliberate new attempt before another paid request.
- Export version 1 is the only restorable backup. Validate the whole file before writing, apply it atomically, and reject a conflicting identifier. Export omits credentials, settings, and bulk source caches.
- Mathematics and policy run in code. A model may draft only from supplied evidence. It cannot choose eligibility, invent a probability, or switch providers.

## Release

No market is released. The inspected historical holdout is development evidence and cannot satisfy protocol `prospective-2026-10-26`. Showing an unvalidated model pick does not release its market and does not change the research policy.

Release requires that frozen protocol: 500 priced games for the market, Brier and log loss no worse than the no-vig close, and a slate-clustered 90% log-loss difference interval whose upper end is at most zero. Missing prospective evidence blocks release. A released market is not a profitability claim. An unreleased market's model picks say "Unvalidated model pick" and that the forecasting model has not beaten the closing market. A released market's model picks say "Released model pick".

A prospective forecast stays frozen. Later evaluation uses later observations. It does not regenerate the prediction from a newer schedule, starter list, artifact, or score.

## Verification

`npm run verify` is the application check: format, lint, types, unit tests, production build, and isolated browser acceptance. `TEST_DATABASE_URL=... npm run verify:database` is the storage check. It never reads `.env` and never falls back to `DATABASE_URL`.

A workflow is verified only after the command that exercises it has passed. A helper test does not verify the page, and a browser fixture does not verify Neon. Tests assert saved records, returned failures, exports, and outgoing requests.

Browser verification uses the production server, `POCKETCHECK_TEST_MODE=fixture-browser`, a memory journal, and no provider credentials. `/__verification` exists only in that mode. Database tests migrate a generated `it_` schema and drop only that schema.

Give each worktree its own `node_modules`. A shared install shares SvelteKit's generated route types.

## Boundaries

Stay on the NFL pregame journal: moneyline, spread, and total. New sports, live betting, automatic bet placement, bankroll advice, and a multi-user deployment are out of scope.

Parse provider, weather, artifact, evaluation, and backup payloads at the edge. A malformed payload becomes a visible gap or a rejection, and the saved attempt stays readable.

`DATABASE_URL` is the user's Neon journal. `npm run db:migrate` is the only migration path, and it applies pending files in `migrations/` in order. Do not point a test, a reset, or a destructive query at that database.
