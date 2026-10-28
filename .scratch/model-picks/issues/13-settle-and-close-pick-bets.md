# 13: Settle and compare closes for actual bets made from a model pick

**What to build:** An actual bet recorded from a model pick can be settled and given a closing comparison like any other actual bet. Today settlement and closing records are tied to an analysis, so a pick bet cannot be graded or compared. The bet is graded from its own placed contract, shows up in actual-bet performance, and a correction keeps the earlier grade in history.

**Blocked by:** 08, 10

**Status:** claimed

- [ ] A final settlement notice grades a pick bet from its own contract, so a placed -3.5 loses on a 3-point win even if the pick was -3
- [ ] Postponed and unresolved notices stay unresolved; void stays void; corrections name the earlier notice and keep history
- [ ] A comparable closing observation can be recorded for a pick bet, with the same-contract rules and unavailable-not-zero behavior
- [ ] Actual-bet performance counts pick bets with their own stake and contract, and does not mix them into model-pick performance
- [ ] Existing analysis bets, settlements, and closings behave exactly as before
- [ ] Store contract tests on memory and Neon; a browser or run-level test settles a pick bet
- [ ] `npm run verify` and `npm run verify:database` pass
