# 12: Retire version 4 artifacts and update docs

**What to build:** Version 4 artifacts are rejected with a clear "refit required" reason, and the app runs only on the market-anchored artifact. The docs describe what the forecasting model now uses and how it was judged: the model evaluation note with ablation and comparison results, the free data audit, the handbook, README, and AGENTS.md. No claim of profitability or release is made unless the protocol supports it.

**Blocked by:** 05, 06, 07, 08, 09, 10

**Status:** resolved

- [x] Loading a version 4 artifact produces an unavailable-model reason saying refit is required, with a regression test
- [x] The model evaluation note records real-data comparison and ablation results, labeled development evidence
- [x] The free data audit lists the sources now used, with licenses
- [x] The handbook explains the anchor line, the new inputs, and line shopping in glossary vocabulary
- [x] README and AGENTS.md reflect the new forecasting model, and the release gate wording is unchanged
- [x] `npm run verify` passes

## Answer

Version 4 artifacts are rejected with a refit-required reason. The model evaluation note, data audit, handbook, README, and AGENTS.md describe the market-anchored forecasting model.

Verified 2026-10-28 on `feature/forecasting-model-improvements`: `npm run verify` (540 unit tests, 31 browser tests) and `verify:database` (95 tests) pass.
