# 11: Settle assessments and bets with correction history

**What to build:** Record and inspect assessment and actual-bet results using their own contracts. Support unresolved events, postponements, duplicate notices, and reasoned corrections without deleting history.

**Blocked by:** 09: Record complete actual-bet contracts, 10: Freeze primary assessments before outcomes

**Status:** resolved

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 29, 30, 31, 32.

- [x] Expose settlement entry and readback for primary assessments and actual bets, preserving their separate recorded contracts and market rules.
- [x] Support win, loss, push, void, and unresolved states. A postponement remains unresolved until an applicable result is recorded.
- [x] Persist settlement notices as append-only events with stable identifiers, timestamps, record references, and reasons where required.
- [x] Ignore repeated notices without double-counting results. Reject conflicting reuse of an event identifier.
- [x] A correction references the earlier notice and requires a reason. Show the full history and effective result without deleting or overwriting prior notices.
- [x] Grade differing research and actual-bet lines independently, including a score where -3 pushes but -3.5 loses.
- [ ] Verify duplicates, postponements, corrections, market rules, and durable readback through the application journal boundary and production-browser acceptance. Memory store contract passed (32 tests), including the four settlement cases. Neon settlement cases passed on disposable Postgres (`postgresql://nochaserz@127.0.0.1:55431/postgres`): independent lines, duplicates, postponement, and correction. The same job still fails 21 older tests, and that save failure (`completed analyses rows are immutable`) also fails on integrate/pocketcheck-mvp at ef8880d. Production-browser acceptance was not run: port 42627 was already in use.
- [x] Document reachable settlement capabilities and retain earlier implementation history when updating completion records.

## Answer

The journal records settlement notices and reads grades back for the researched offer and each captured actual bet. Grading uses the existing `settleOffer` rules on each contract. A home win by 3 pushes a -3 spread and loses a -3.5 spread. Postponed and unresolved notices stay unresolved. A void notice is a void. The same event identifier returns the existing notice. A different payload for that identifier is rejected. A correction is a new notice that names the earlier notice and requires a reason. History is append-only. Migration `010_settlements.sql` stores the notices. Memory store contract passed, 32 tests. Neon settlement cases passed. Older Neon failures also fail on the integration tip and were not changed here. Production-browser acceptance was not run because port 42627 was already in use.
