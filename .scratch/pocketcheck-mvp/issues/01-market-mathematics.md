# 01: Market mathematics

**What to build:** A user can describe a full-game NFL moneyline, spread, or total offer and see correct decimal odds, break-even, optional market-margin estimates, expected value only when probabilities are supplied, unit returns, and settlement under saved rules. Invalid or incomplete offers fail with a clear reason instead of a number. Missing probability or expected value stays unavailable, never zero.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Positive and negative American prices convert to decimal odds and back within a documented tolerance.
- [ ] −110 yields decimal 1.9090909 and a 52.38095% decisive break-even. A hypothetical 55% no-push win probability yields +0.05 units of expected value per unit.
- [ ] A three-outcome case (52% win, 45% loss, 3% push at −110) yields about +0.022727 units. The decisive break-even is not treated as an unconditional win threshold when pushes exist.
- [ ] Comparable −150 / +130 prices produce the proportional margin estimate from the handbook. A one-sided price, a different line, or a mismatched book/time omits the margin estimate.
- [ ] A spread wins when selected-team margin plus the stored line is greater than zero, pushes on equality for a whole line, and loses otherwise. Totals follow the selected over/under direction. Moneyline ties follow saved rules and are not silently graded as a loss.
- [ ] Nonfinite prices, missing required market fields, and incompatible opposing prices are rejected.
- [ ] Unit return is stake times (decimal minus 1) on a win, negative stake on a loss, and zero on push or void. An empty ROI denominator is unavailable.
- [ ] Worked examples are labeled illustrative. No AI or database is required.
