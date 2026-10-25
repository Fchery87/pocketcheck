# 03: Immutable research journal

**What to build:** The user can save an offer, its evidence, and an analysis run, then refresh into a new run without rewriting the original. Both versions remain readable. Actual bets stay separate from system assessments. Settlement corrections keep their reasons. A journal export can be restored without credentials or rewritten timestamps.

**Blocked by:** 01: Market mathematics

**Status:** resolved

- [x] Offers, evidence, analyses, and their associations persist in the designated Neon database with UTC timestamps.
- [x] A refresh creates a new run linked to its parent. The original offer, evidence, and report cannot be edited.
- [x] A failed write leaves prior records intact. A duplicate submission does not create a second billable analysis.
- [x] Actual bets record price, time, and stake in units separately from the system conclusion.
- [x] Settlement is win, loss, push, void, or unresolved. A correction appends a reason and history.
- [x] Export and restore preserve relationships and original timestamps. Serialized records and exports contain no API keys.
- [x] Integration tests use the explicitly designated disposable database and do not reset unrelated databases.

## Answer

`migrations/001_initial.sql` and `JournalRepository` store games, immutable offers, evidence, analyses, reports, bets, and settlement corrections in the disposable Neon project `pocketcheck` (`fancy-night-27671966`). A refresh is a new analysis with a parent id. Duplicate idempotency keys return the existing run. Export JSON contains no connection strings. Verified by `tests/integration/journal.test.ts` on 2026-10-25. `npm test` excludes that file so the default suite does not require the database. Use `npm run test:integration`.

## Comments

- 2026-10-25: Merged to `integrate/pocketcheck-mvp` from `ticket/03-immutable-journal`.
