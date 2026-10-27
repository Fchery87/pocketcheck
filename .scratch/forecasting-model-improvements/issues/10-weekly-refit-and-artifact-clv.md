# 10: Weekly refit and closing-line value by artifact

**What to build:** A refit command fits the latest eligible data and writes a new, unreleased, checksummed artifact plus its evaluation report and comparison with the artifact in use. It never replaces the artifact in use without an explicit flag. The model-pick performance view groups closing-line value and results by artifact checksum, so the user can tell within weeks whether a new version helps.

**Blocked by:** 03, model-picks 09

**Status:** ready-for-agent

- [ ] The refit command preserves existing output when inputs are invalid and exits non-zero with an explanation
- [ ] The artifact in use changes only with the explicit flag, covered by a test
- [ ] New artifacts are always unreleased
- [ ] The performance view groups by artifact checksum with explicit denominators; a missing close is unavailable, never zero
- [ ] `npm run verify` and `npm run verify:database` pass
