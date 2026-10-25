# 01: Market mathematics

**What to build:** A user can describe a full-game NFL moneyline, spread, or total offer and see correct decimal odds, break-even, optional market-margin estimates, expected value only when probabilities are supplied, unit returns, and settlement under saved rules. Invalid or incomplete offers fail with a clear reason instead of a number. Missing probability or expected value stays unavailable, never zero.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Positive and negative American prices convert to decimal odds and back within a documented tolerance.
- [x] −110 yields decimal 1.9090909 and a 52.38095% decisive break-even. A hypothetical 55% no-push win probability yields +0.05 units of expected value per unit.
- [x] A three-outcome case (52% win, 45% loss, 3% push at −110) yields about +0.022727 units. The decisive break-even is not treated as an unconditional win threshold when pushes exist.
- [x] Comparable −150 / +130 prices produce the proportional margin estimate from the handbook. A one-sided price, a different line, or a mismatched book/time omits the margin estimate.
- [x] A spread wins when selected-team margin plus the stored line is greater than zero, pushes on equality for a whole line, and loses otherwise. Totals follow the selected over/under direction. Moneyline ties follow saved rules and are not silently graded as a loss.
- [x] Nonfinite prices, missing required market fields, and incompatible opposing prices are rejected.
- [x] Unit return is stake times (decimal minus 1) on a win, negative stake on a loss, and zero on push or void. An empty ROI denominator is unavailable.
- [x] Worked examples are labeled illustrative. No AI or database is required.

## Answer

Pure domain functions in `src/lib/domain` convert American prices, compute decisive and unconditional break-even, omit margin estimates without a comparable complement, settle spreads, totals, and moneyline ties under saved rules, and leave missing expected value and empty ROI denominators unavailable. Verified with `npx vp test run` (24 tests) and `svelte-check` (0 errors) on 2026-10-25.

## Comments

- 2026-10-25: Implemented on `integrate/pocketcheck-mvp` while ticket 02 ran in a separate worktree.
