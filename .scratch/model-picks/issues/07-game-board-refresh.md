# 07: Game board refresh

**What to build:** From a frozen game board, the user refreshes with new prices for the same game. The child board links to its parent. It may change sportsbook, lines, odds, and observation time, and add or drop markets. Each new model pick links to the parent's pick in the same market. The parent board and picks are unchanged.

**Blocked by:** 04

**Status:** resolved

- [x] A refresh creates a linked child board with its own submission identifier
- [x] Each child model pick references the parent model pick in the same market when one exists
- [x] The parent board, picks, and explanations read back unchanged
- [x] A refresh uses the same validation as a new board and keeps typed values on rejection
- [x] The pick page shows the parent and child side by side or linked
- [x] Store contract and run-level tests cover linking and immutability
- [x] `npm run verify` and `npm run verify:database` pass

## Answer

A refresh creates a linked child board with its own submission identifier, and each child pick names the parent pick in the same market.
The links are enforced by database triggers, and the parent board, picks, and explanations read back unchanged.
Migration 015 adds the refresh links; the board page shows the parent and its refreshes.
