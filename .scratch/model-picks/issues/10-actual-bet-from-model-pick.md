# 10: Record an actual bet from a model pick

**What to build:** A model pick card links to the actual-bet form with the picked contract filled in as editable starting values. The saved actual bet keeps its own contract, placement time, stake units, and submission identifier, plus an optional reference to the model pick. If the user changes the odds or line, the bet records what was placed, and the board is unchanged.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Prefilled values are editable and validated independently, like any actual bet
- [ ] The actual bet stores an optional model pick reference; existing bets without one are unaffected
- [ ] Saving the bet never changes the board or the model pick
- [ ] Repeated submission identifiers return the same bet; reuse with different terms is a conflict
- [ ] The browser test records a bet from a pick with edited odds and sees the placed odds saved
- [ ] `npm run verify` and `npm run verify:database` pass
