# 11: Journal export and restore include game boards and model picks

**What to build:** The journal backup includes game boards, quotes, model picks, explanations, provider attempts, grades and corrections, primary classifications, and actual-bet references. Restoring it brings them back atomically. Older backups still restore.

**Blocked by:** 06, 07, 08, 09, 10, 13

**Status:** resolved

- [x] Decide whether the new records need export version 2. If they do, version 1 still restores unchanged, and the docs and AGENTS.md say which versions restore
- [x] Restore validates the whole file before writing, applies it atomically, and is idempotent for identical records
- [x] Malformed records, missing relationships, unsupported versions, and conflicting identifiers are rejected with the destination unchanged
- [x] Restore applies boards and picks before actual bets, since a bet from a model pick references its pick
- [x] Export still omits credentials, settings, and bulk source caches
- [x] Store contract tests round-trip a journal with boards and picks on memory and Neon
- [x] `npm run verify` passes. `TEST_DATABASE_URL` pointing at a disposable database, `npm run verify:database` passes.

## Answer

Export stays version 1. The new records are optional lists on that document, so a backup written before boards still restores and a missing board list is empty. A file that claims another version is rejected and the destination is unchanged. AGENTS.md already says version 1 is the only restorable backup, so it was left for ticket 12.
