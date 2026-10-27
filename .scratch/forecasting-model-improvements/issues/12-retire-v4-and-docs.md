# 12: Retire version 4 artifacts and update docs

**What to build:** Version 4 artifacts are rejected with a clear "refit required" reason, and the app runs only on the market-anchored artifact. The docs describe what the forecasting model now uses and how it was judged: the model evaluation note with ablation and comparison results, the free data audit, the handbook, README, and AGENTS.md. No claim of profitability or release is made unless the protocol supports it.

**Blocked by:** 05, 06, 07, 08, 09, 10

**Status:** ready-for-agent

- [ ] Loading a version 4 artifact produces an unavailable-model reason saying refit is required, with a regression test
- [ ] The model evaluation note records real-data comparison and ablation results, labeled development evidence
- [ ] The free data audit lists the sources now used, with licenses
- [ ] The handbook explains the anchor line, the new inputs, and line shopping in glossary vocabulary
- [ ] README and AGENTS.md reflect the new forecasting model, and the release gate wording is unchanged
- [ ] `npm run verify` passes
