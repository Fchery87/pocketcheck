# 11: Journal export and restore include game boards and model picks

**What to build:** The journal backup includes game boards, quotes, model picks, explanations, provider attempts, grades and corrections, primary classifications, and actual-bet references. Restoring it brings them back atomically. Older backups still restore.

**Blocked by:** 06, 07, 08, 09, 10

**Status:** ready-for-agent

- [ ] Decide whether the new records need export version 2. If they do, version 1 still restores unchanged, and the docs and AGENTS.md say which versions restore
- [ ] Restore validates the whole file before writing, applies it atomically, and is idempotent for identical records
- [ ] Malformed records, missing relationships, unsupported versions, and conflicting identifiers are rejected with the destination unchanged
- [ ] Export still omits credentials, settings, and bulk source caches
- [ ] Store contract tests round-trip a journal with boards and picks on memory and Neon
- [ ] `npm run verify` and `npm run verify:database` pass
