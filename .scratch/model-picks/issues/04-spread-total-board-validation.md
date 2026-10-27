# 04: Spread and total on the board, and board validation

**What to build:** The game board accepts all three markets, each optional. The user enters the home spread line, and the away line fills in as its mirror. Totals take one shared number with over and under odds. Each entered market gets its own model pick card. Bad boards are rejected with a clear reason, and every typed value is kept.

**Blocked by:** 03

**Status:** resolved

- [x] Spread and total model picks are calculated with push probabilities from the forecasting model's margin and total distributions
- [x] Rejections: empty board, one-sided market, non-mirrored spread lines, different over and under totals, invalid American odds, missing moneyline tie rule, observation at or after kickoff
- [x] A rejected board returns every typed value
- [x] A board with any subset of markets yields one model pick per entered market
- [x] Market and tie rule stay native selects, following ADR 0001 and DESIGN.md; the layout works at phone width
- [x] Run-level and browser tests cover a three-market board and a rejected board
- [x] `npm run verify` and `npm run verify:database` pass

## Answer

Spread and total are on the board, each optional, with the away spread line mirrored from the home line and one shared total. Rejections cover empty and one-sided markets, non-mirrored lines, differing totals, bad odds, a missing moneyline tie rule, and started games, and keep typed values.
American odds with an absolute value under 100 are now rejected everywhere, so boards and analyses agree; -100 and +100 stay valid as even money.
