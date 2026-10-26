# 16: Restore the journal atomically and repeatably

**What to build:** Restore a downloaded journal through the application without partial writes, duplicate records, or overwriting completed history.

**Blocked by:** 15: Export the complete journal

**Status:** ready-for-agent

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 40, 41, 53, 54.

- [ ] Validate the whole backup version, shapes, identifiers, relationships, snapshots, and event histories before committing any import.
- [ ] Apply a valid import atomically. A malformed record, missing relationship, incompatible version, or conflicting identifier leaves the destination unchanged.
- [ ] Deduplicate identical records so restoring the same backup twice produces the same journal. Conflicting identifiers fail visibly rather than replacing saved history.
- [ ] Preserve original timestamps, primary classifications, legacy limitations, provider accounting, frozen forecasts, and settlement correction chains.
- [ ] Keep restored pending or ambiguous attempts readable without automatically replaying external source or provider work.
- [ ] Demonstrate the complete browser journey through analysis, changed-line refresh, differing actual bet, settlement, correction, closing observation, export, and restore into isolated empty storage.
- [ ] Compare the recovered records with the originals through persistent readback. Verify failure atomicity and repeated import against both memory and Neon contracts.
- [ ] Document supported backup versions and reachable recovery behavior. Update completion records without closing or modifying the parent specification.
