# 11: Line shopping across sportsbooks

**What to build:** On a game board, the user can enter several sportsbook quotes per side, each with its own sportsbook, point line, odds, and observation time. The model pick's expected value and grade use the best available price among quotes on the same point line as the anchor sportsbook. Quotes on other lines are listed as other contracts. The anchor line always comes from one sportsbook's two sides, which the user can mark. Every quote is frozen with the board, and an actual bet from the pick prefills the best sportsbook and price.

**Blocked by:** model-picks 04, model-picks 10

**Status:** ready-for-agent

- [ ] The board form adds and removes quotes per side; typed values are kept on rejection
- [ ] Best available price compares only quotes on the same point line; others are shown as different contracts
- [ ] The no-vig anchor uses a single sportsbook's two sides and never mixes books
- [ ] Every quote is frozen in the board record and included in the store contract
- [ ] The actual bet prefills the best sportsbook and price as editable values
- [ ] A browser test enters two sportsbooks for one side, sees the best marked, sees a different-line quote listed separately, and records a bet with the best price
- [ ] `npm run verify` and `npm run verify:database` pass
