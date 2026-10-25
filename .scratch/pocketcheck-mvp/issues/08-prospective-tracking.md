# 08: Prospective tracking and recovery

**What to build:** Before kickoff, PocketCheck freezes which assessment counts as the primary one. Later refreshes stay in a separate all-runs view. Results settle as win, loss, push, void, or unresolved. The user can export and restore the journal after a local or database failure. System performance and actual bets are summarized separately, and missing closing prices are unavailable rather than zero.

**Blocked by:** 07: Experimental value decision

**Status:** ready-for-agent

- [ ] The primary eligible assessment is chosen before outcomes and is distinct from later refreshes.
- [ ] Settlement covers win, loss, push, void, unresolved, postponement, duplicate notices, and corrections with reasons.
- [ ] A comparable closing offer can be recorded. A different point line is not treated as the same contract. Absent closing value is unavailable.
- [ ] Export and restore keep relationships and original timestamps, and omit credentials and bulk source caches.
- [ ] Interrupted runs, unavailable providers, schema changes, and failed database writes leave existing research readable.
- [ ] Summaries never treat unresolved results or missing prices as zero, and never pool every refresh into one independent sample.
