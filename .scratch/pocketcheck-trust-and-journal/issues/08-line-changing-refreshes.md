# 08: Support accurate offer entry and line-changing refreshes

**What to build:** Enter valid market-specific offers and refresh them when the sportsbook changes the line or price. Every refresh remains a new linked report with its own observation time.

**Blocked by:** 05: Make analysis submissions durable and idempotent

**Status:** ready-for-agent

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 3, 4, 13, 14.

- [ ] Offer entry presents only selections compatible with the chosen market and explains selected-side spread signs, total lines, and applicable tie rules.
- [ ] A refresh accepts a changed point line, sportsbook, odds, and observation time while retaining the parent market and selection.
- [ ] A different market or selection starts separate research rather than silently changing the meaning of the refresh chain.
- [ ] Validate the complete refreshed contract before external work. Retain valid entered values when validation fails.
- [ ] Use the durable submission identifier and pending interaction from ticket 05. An intentional refresh gets a new identifier while duplicate submissions do not create extra work.
- [ ] After changing a spread or total line, the child displays the new contract and links to the unchanged parent. Verify original values after database readback.
- [ ] Cover moneyline, spread, and total entry plus invalid and changed-line refreshes through production-browser acceptance. Update user-facing capability documentation.
