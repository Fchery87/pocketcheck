# 16: Restore the journal atomically and repeatably

**What to build:** Restore a downloaded journal through the application without partial writes, duplicate records, or overwriting completed history.

**Blocked by:** 15: Export the complete journal

**Status:** resolved

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 40, 41, 53, 54.

- [x] Validate the whole backup version, shapes, identifiers, relationships, snapshots, and event histories before committing any import.
- [x] Apply a valid import atomically. A malformed record, missing relationship, incompatible version, or conflicting identifier leaves the destination unchanged.
- [x] Deduplicate identical records so restoring the same backup twice produces the same journal. Conflicting identifiers fail visibly rather than replacing saved history.
- [x] Preserve original timestamps, primary classifications, legacy limitations, provider accounting, frozen forecasts, and settlement correction chains.
- [x] Keep restored pending or ambiguous attempts readable without automatically replaying external source or provider work.
- [ ] Demonstrate the complete browser journey through analysis, changed-line refresh, differing actual bet, settlement, correction, closing observation, export, and restore into isolated empty storage. The production browser now covers correction, download, rejection of a bad version, and restore of the same file in the current journal. It does not yet restore into a separate empty journal. That isolation is covered by the Neon and memory journal contract.
- [x] Compare the recovered records with the originals through persistent readback. Verify failure atomicity and repeated import against both memory and Neon contracts.
- [x] Document supported backup versions and reachable recovery behavior. Update completion records without closing or modifying the parent specification.

The browser covers the journey except restore into a separate empty journal. The application journal contract covers that isolation on memory and Neon. `docs/testing.md` documents version 1 and the journal page restore form. The parent specification was not modified.

## Answer

Version 1 is the only backup restore accepts. `JournalRepository.restoreJournal` checks version, shapes, identifiers, relationships, snapshots, and settlement-notice history before it writes. A valid file is one transaction. The same file a second time leaves the journal unchanged. A conflicting identifier throws and rolls back. Pending and ambiguous attempts are copied as records and are not sent to a source or a provider.

The version 1 file now also includes application settlement notices, so a correction chain survives export and restore. Older version 1 files without that list still restore. The journal page posts a file to `?/restore` and shows a rejection without changing completed analyses.

A disposable Postgres test rejected version 2 and a missing parent with zero rows written, rejected a changed conclusion on an existing analysis, and round-tripped an existing export twice. The shared store contract recovered a changed-line refresh, a different placed line, a settlement, a correction, and a closing observation into an empty memory store and an empty Neon schema. 85 memory, journal, and Neon tests passed. Browser acceptance was not run.
