# 03: Immutable research journal

**What to build:** The user can save an offer, its evidence, and an analysis run, then refresh into a new run without rewriting the original. Both versions remain readable. Actual bets stay separate from system assessments. Settlement corrections keep their reasons. A journal export can be restored without credentials or rewritten timestamps.

**Blocked by:** 01: Market mathematics

**Status:** ready-for-agent

- [ ] Offers, evidence, analyses, and their associations persist in the designated Neon database with UTC timestamps.
- [ ] A refresh creates a new run linked to its parent. The original offer, evidence, and report cannot be edited.
- [ ] A failed write leaves prior records intact. A duplicate submission does not create a second billable analysis.
- [ ] Actual bets record price, time, and stake in units separately from the system conclusion.
- [ ] Settlement is win, loss, push, void, or unresolved. A correction appends a reason and history.
- [ ] Export and restore preserve relationships and original timestamps. Serialized records and exports contain no API keys.
- [ ] Integration tests use the explicitly designated disposable database and do not reset unrelated databases.
