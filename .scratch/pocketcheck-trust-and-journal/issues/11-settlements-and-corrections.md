# 11: Settle assessments and bets with correction history

**What to build:** Record and inspect assessment and actual-bet results using their own contracts. Support unresolved events, postponements, duplicate notices, and reasoned corrections without deleting history.

**Blocked by:** 09: Record complete actual-bet contracts, 10: Freeze primary assessments before outcomes

**Status:** ready-for-agent

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 29, 30, 31, 32.

- [ ] Expose settlement entry and readback for primary assessments and actual bets, preserving their separate recorded contracts and market rules.
- [ ] Support win, loss, push, void, and unresolved states. A postponement remains unresolved until an applicable result is recorded.
- [ ] Persist settlement notices as append-only events with stable identifiers, timestamps, record references, and reasons where required.
- [ ] Ignore repeated notices without double-counting results. Reject conflicting reuse of an event identifier.
- [ ] A correction references the earlier notice and requires a reason. Show the full history and effective result without deleting or overwriting prior notices.
- [ ] Grade differing research and actual-bet lines independently, including a score where -3 pushes but -3.5 loses.
- [ ] Verify duplicates, postponements, corrections, market rules, and durable readback through the application journal boundary and production-browser acceptance.
- [ ] Document reachable settlement capabilities and retain earlier implementation history when updating completion records.
