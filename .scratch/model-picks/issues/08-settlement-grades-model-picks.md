# 08: Settlement grades model picks

**What to build:** Recording a game's final score grades every model pick on that game from the picked side's own contract. The user sees won, lost, push, or void on each card. Postponed and unresolved notices stay unresolved. A correction regrades and keeps the earlier grade in history.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Decide and record in the store contract whether settlement notices are keyed to the game or to the board. The same event identifier never produces two grades
- [ ] A final notice grades each model pick with its own market rules, so a home −3 pushes on a 3-point home win
- [ ] Postponed and unresolved notices stay unresolved, not losses; void stays void
- [ ] Corrections are new notices naming the earlier one, with a reason; history and the latest effective grade are shown
- [ ] Existing analysis and actual-bet settlement behavior is unchanged
- [ ] Store contract tests on memory and Neon; a browser or run-level test sees a graded card
- [ ] `npm run verify` and `npm run verify:database` pass
