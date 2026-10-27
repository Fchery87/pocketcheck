# 04: Spread and total on the board, and board validation

**What to build:** The game board accepts all three markets, each optional. The user enters the home spread line, and the away line fills in as its mirror. Totals take one shared number with over and under odds. Each entered market gets its own model pick card. Bad boards are rejected with a clear reason, and every typed value is kept.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Spread and total model picks are calculated with push probabilities from the forecasting model's margin and total distributions
- [ ] Rejections: empty board, one-sided market, non-mirrored spread lines, different over and under totals, invalid American odds, missing moneyline tie rule, observation at or after kickoff
- [ ] A rejected board returns every typed value
- [ ] A board with any subset of markets yields one model pick per entered market
- [ ] Market and tie rule stay native selects, following ADR 0001 and DESIGN.md; the layout works at phone width
- [ ] Run-level and browser tests cover a three-market board and a rejected board
- [ ] `npm run verify` and `npm run verify:database` pass
