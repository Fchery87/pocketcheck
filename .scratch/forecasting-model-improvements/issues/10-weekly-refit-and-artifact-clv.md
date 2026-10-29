# 10: Weekly refit and closing-line value by artifact

**What to build:** A refit command fits the latest eligible data and writes a new, unreleased, checksummed artifact plus its evaluation report and comparison with the artifact in use. It never replaces the artifact in use without an explicit flag. The model-pick performance view groups closing-line value and results by artifact checksum, so the user can tell within weeks whether a new version helps.

**Blocked by:** 03, model-picks 09

**Status:** resolved

- [x] The refit command preserves existing output when inputs are invalid and exits non-zero with an explanation
- [x] The artifact in use changes only with the explicit flag, covered by a test
- [x] New artifacts are always unreleased
- [x] The performance view groups by artifact checksum with explicit denominators; a missing close is unavailable, never zero
- [x] `npm run verify` and `npm run verify:database` pass

## Answer

`npm run model:refit` writes a new unreleased artifact beside the one in use and leaves it untouched on bad inputs. The model-pick performance view groups primary picks by artifact checksum with the same denominators; a missing close stays missing.

Verified 2026-10-28 on `feature/forecasting-model-improvements`: `npm run verify` (540 unit tests, 31 browser tests) and `verify:database` (95 tests) pass.
