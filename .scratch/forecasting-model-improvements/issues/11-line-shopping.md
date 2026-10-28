# 11: Line shopping across sportsbooks

**What to build:** On a game board, the user can enter several sportsbook quotes per side, each with its own sportsbook, point line, odds, and observation time. The model pick's expected value and grade use the best available price among quotes on the same point line as the anchor sportsbook. Quotes on other lines are listed as other contracts. The anchor line always comes from one sportsbook's two sides, which the user can mark. Every quote is frozen with the board, and an actual bet from the pick prefills the best sportsbook and price.

**Blocked by:** model-picks 04, model-picks 10

**Status:** resolved

- [x] The board form adds and removes quotes per side; typed values are kept on rejection
- [x] Best available price compares only quotes on the same point line; others are shown as different contracts
- [x] The no-vig anchor uses a single sportsbook's two sides and never mixes books
- [x] Every quote is frozen in the board record and included in the store contract
- [x] The actual bet prefills the best sportsbook and price as editable values
- [x] A browser test enters two sportsbooks for one side, sees the best marked, sees a different-line quote listed separately, and records a bet with the best price
- [x] `npm run verify` and `npm run verify:database` pass

## Answer

The board form adds and removes extra sportsbook quotes and keeps typed values on rejection. The best price on the anchor line is marked, a different line is listed as another contract, and a bet recorded from the pick starts from the shopped sportsbook and price. A browser test covers the path.

Verified 2026-10-28 on `feature/forecasting-model-improvements`: `npm run verify` (540 unit tests, 31 browser tests) and `verify:database` (95 tests) pass.
