# 08: Settlement grades model picks

**What to build:** Recording a game's final score grades every model pick on that game from the picked side's own contract. The user sees won, lost, push, or void on each card. Postponed and unresolved notices stay unresolved. A correction regrades and keeps the earlier grade in history.

**Blocked by:** 04

**Status:** resolved

- [x] Decide and record in the store contract whether settlement notices are keyed to the game or to the board. The same event identifier never produces two grades
- [x] A final notice grades each model pick with its own market rules, so a home −3 pushes on a 3-point home win
- [x] Postponed and unresolved notices stay unresolved, not losses; void stays void
- [x] Corrections are new notices naming the earlier one, with a reason; history and the latest effective grade are shown
- [x] Existing analysis and actual-bet settlement behavior is unchanged
- [x] Store contract tests on memory and Neon; a browser or run-level test sees a graded card
- [x] `npm run verify` and `npm run verify:database` pass

## Answer

Settlement notices are keyed to the game, so one event identifier gives one grade on every board of that game.
A final notice grades each pick from its own contract, postponed and unresolved stay unresolved, void stays void, and a correction names the earlier notice with a reason.
Migration 014 relaxes settlement_notices and adds game_id; analysis and actual-bet settlement are unchanged.
