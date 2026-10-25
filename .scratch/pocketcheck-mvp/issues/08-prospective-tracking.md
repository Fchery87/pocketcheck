# 08: Prospective tracking and recovery

**What to build:** Before kickoff, PocketCheck freezes which assessment counts as the primary one. Later refreshes stay in a separate all-runs view. Results settle as win, loss, push, void, or unresolved. The user can export and restore the journal after a local or database failure. System performance and actual bets are summarized separately, and missing closing prices are unavailable rather than zero.

**Blocked by:** 07: Experimental value decision

**Status:** resolved

- [x] The primary eligible assessment is chosen before outcomes and is distinct from later refreshes.
- [x] Settlement covers win, loss, push, void, unresolved, postponement, duplicate notices, and corrections with reasons.
- [x] A comparable closing offer can be recorded. A different point line is not treated as the same contract. Absent closing value is unavailable.
- [x] Export and restore keep relationships and original timestamps, and omit credentials and bulk source caches.
- [x] Interrupted runs, unavailable providers, schema changes, and failed database writes leave existing research readable.
- [x] Summaries never treat unresolved results or missing prices as zero, and never pool every refresh into one independent sample.

## Answer

Primary selection uses the earliest completed pregame run and does not read the final score. Later refreshes stay in the all-runs view. Closing comparison requires the same market, side, point line, and book. A different line or a missing price is unavailable. System and actual-bet summaries are separate. Unresolved rows are not zero. Redaction strips connection strings and secret-shaped tokens from export text. Recovery states say completed reports stay readable. Unit tests: 14 new tests. Full `npm test`: 76 passed. Neon journal integration remains `npm run test:integration`. Settlement correction history is still covered by that integration test.

## Comments

- 2026-10-25: Merged to `integrate/pocketcheck-mvp` from `ticket/08-prospective`.
