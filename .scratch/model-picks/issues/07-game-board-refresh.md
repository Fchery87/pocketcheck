# 07: Game board refresh

**What to build:** From a frozen game board, the user refreshes with new prices for the same game. The child board links to its parent. It may change sportsbook, lines, odds, and observation time, and add or drop markets. Each new model pick links to the parent's pick in the same market. The parent board and picks are unchanged.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] A refresh creates a linked child board with its own submission identifier
- [ ] Each child model pick references the parent model pick in the same market when one exists
- [ ] The parent board, picks, and explanations read back unchanged
- [ ] A refresh uses the same validation as a new board and keeps typed values on rejection
- [ ] The pick page shows the parent and child side by side or linked
- [ ] Store contract and run-level tests cover linking and immutability
- [ ] `npm run verify` and `npm run verify:database` pass
