# 09: Primary model picks and model-pick performance

**What to build:** For each game and market, the earliest completed model pick with a cutoff strictly before kickoff is the primary model pick, frozen when its board finishes. Its forecast is frozen under protocol `prospective-2026-10-26`. A model-pick performance view, separate from assessment and actual-bet performance, shows primary model picks by market and strength grade. It includes one-unit return on the picked contract, closing comparisons, and explicit denominators.

**Blocked by:** 07, 08

**Status:** resolved

- [x] The primary model pick follows the analysis primary's tie and legacy rules; refreshes are never primary
- [x] Primary model pick forecasts are recorded as prospective forecasts without regeneration
- [x] The view breaks down by market and by grade, with settled, unresolved, push, void, and missing-close counts
- [x] Push and void return stake and leave the return denominator; unresolved and missing close show as unavailable, never zero
- [x] Closing comparisons use the same market, side, point line, sportsbook, and rules; a different line is line movement
- [x] Assessment and actual-bet summaries are unchanged
- [x] Store contract and run-level tests cover classification and counts
- [x] `npm run verify` passes. `npm run verify:database` was not run: `TEST_DATABASE_URL` was unset, and the check does not read `.env`.

## Answer

The earliest completed pregame model pick per game and market is frozen as primary when its board finishes, under protocol `prospective-2026-10-26`. The saved forecast is read back, not regenerated. Later boards and refreshes stay non-primary. Picks finished before roles existed stay unclassified. `/board/performance` counts only primaries, by market and grade. `npm run verify` passed, including 30 browser tests. `npm run verify:database` was not run: `TEST_DATABASE_URL` is not set in this worktree, and the check does not read `.env`.
