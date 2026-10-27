# 09: Primary model picks and model-pick performance

**What to build:** For each game and market, the earliest completed model pick with a cutoff strictly before kickoff is the primary model pick, frozen when its board finishes. Its forecast is frozen under protocol `prospective-2026-10-26`. A model-pick performance view, separate from assessment and actual-bet performance, shows primary model picks by market and strength grade. It includes one-unit return on the picked contract, closing comparisons, and explicit denominators.

**Blocked by:** 07, 08

**Status:** ready-for-agent

- [ ] The primary model pick follows the analysis primary's tie and legacy rules; refreshes are never primary
- [ ] Primary model pick forecasts are recorded as prospective forecasts without regeneration
- [ ] The view breaks down by market and by grade, with settled, unresolved, push, void, and missing-close counts
- [ ] Push and void return stake and leave the return denominator; unresolved and missing close show as unavailable, never zero
- [ ] Closing comparisons use the same market, side, point line, sportsbook, and rules; a different line is line movement
- [ ] Assessment and actual-bet summaries are unchanged
- [ ] Store contract and run-level tests cover classification and counts
- [ ] `npm run verify` and `npm run verify:database` pass
