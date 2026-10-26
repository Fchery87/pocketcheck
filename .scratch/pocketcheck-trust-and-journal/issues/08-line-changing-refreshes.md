# 08: Support accurate offer entry and line-changing refreshes

**What to build:** Enter valid market-specific offers and refresh them when the sportsbook changes the line or price. Every refresh remains a new linked report with its own observation time.

**Blocked by:** 05: Make analysis submissions durable and idempotent

**Status:** resolved

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 3, 4, 13, 14.

- [x] Offer entry presents only selections compatible with the chosen market and explains selected-side spread signs, total lines, and applicable tie rules.
- [x] A refresh accepts a changed point line, sportsbook, odds, and observation time while retaining the parent market and selection.
- [x] A different market or selection starts separate research rather than silently changing the meaning of the refresh chain.
- [x] Validate the complete refreshed contract before external work. Retain valid entered values when validation fails.
- [x] Use the durable submission identifier and pending interaction from ticket 05. An intentional refresh gets a new identifier while duplicate submissions do not create extra work.
- [x] After changing a spread or total line, the child displays the new contract and links to the unchanged parent. Verify original values after database readback.
- [x] Cover moneyline, spread, and total entry plus invalid and changed-line refreshes through production-browser acceptance. Update user-facing capability documentation.

## Answer

Market-specific entry lives in `offerEntryGuidance`. Moneyline offers home or away and a tie rule. Spread offers home or away and a selected-side line. Total offers over or under and one shared total. A refresh may change the point line, sportsbook, odds, and observation time. `parseRefreshContract` keeps the parent market and selection and refuses a different pair as separate research. Invalid contracts fail before `runAnalysis`, so no attempt is saved and the form returns the entered values. Each page load issues a new request id. Repeating that id still follows ticket 05.

The child report shows the new contract and links to the parent. Production browser acceptance (5 tests, after merging `66230c3`) covers moneyline entry, an invalid price that stays on the form, a spread refresh from −3.5 to −2.5 at a different book and price, and a return to the unchanged parent. Memory-store readback in `run.test.ts` checks the saved child line and the unchanged parent. README states the same rules. Neon was not rerun in this session. The shared store contract already treats a completed run as immutable.
