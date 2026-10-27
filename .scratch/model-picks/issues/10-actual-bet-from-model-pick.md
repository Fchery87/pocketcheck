# 10: Record an actual bet from a model pick

**What to build:** A model pick card links to the actual-bet form with the picked contract filled in as editable starting values. The saved actual bet keeps its own contract, placement time, stake units, and submission identifier, plus an optional reference to the model pick. If the user changes the odds or line, the bet records what was placed, and the board is unchanged.

**Blocked by:** 04

**Status:** resolved

- [x] Prefilled values are editable and validated independently, like any actual bet
- [x] The actual bet stores an optional model pick reference; existing bets without one are unaffected
- [x] Saving the bet never changes the board or the model pick
- [x] Repeated submission identifiers return the same bet; reuse with different terms is a conflict
- [x] The browser test records a bet from a pick with edited odds and sees the placed odds saved
- [x] `npm run verify` and `npm run verify:database` pass

## Answer

A bet can be recorded from a model pick with prefilled, editable, independently validated terms, and saving never changes the board or the pick.
The bet stores an optional model_pick_id (migration 016), repeated submission identifiers return the same bet, and reuse with different terms conflicts.
Settlement of pick bets is left to ticket 13.
