# 13: Settle and compare closes for actual bets made from a model pick

**What to build:** An actual bet recorded from a model pick can be settled and given a closing comparison like any other actual bet. Today settlement and closing records are tied to an analysis, so a pick bet cannot be graded or compared. The bet is graded from its own placed contract, shows up in actual-bet performance, and a correction keeps the earlier grade in history.

**Blocked by:** 08, 10

**Status:** resolved

- [x] A final settlement notice grades a pick bet from its own contract, so a placed -3.5 loses on a 3-point win even if the pick was -3
- [x] Postponed and unresolved notices stay unresolved; void stays void; corrections name the earlier notice and keep history
- [x] A comparable closing observation can be recorded for a pick bet, with the same-contract rules and unavailable-not-zero behavior
- [x] Actual-bet performance counts pick bets with their own stake and contract, and does not mix them into model-pick performance
- [x] Existing analysis bets, settlements, and closings behave exactly as before
- [x] Store contract tests on memory and Neon; a browser test settles a pick bet and shows the correction.
- [x] `npm run verify` passes. `TEST_DATABASE_URL` pointing at a disposable database, `npm run verify:database` passes.

## Answer

A pick bet is graded from its own placed contract. A home -3.5 loses when the home team wins by 3. Postponed and unresolved notices stay unresolved, void stays void, and a correction names the earlier notice and stays visible in the journal. A comparable close uses that placed contract. A different line is line movement. The journal can also record a close for the model pick itself. The bet counts in actual-bet performance, not model-pick performance. Migration 019 allows a settlement notice that names only the bet. `npm run verify` passed, including the browser test that settles a pick bet and shows the correction. `npm run verify:database` passed against a disposable database.
