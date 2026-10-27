# 12: README, AGENTS.md, handbook, and testing docs

**What to build:** The project describes the game board accurately. README explains the difference between a research analysis and a model pick. AGENTS.md Journal rules cover:

- game board and model pick separation
- the primary model pick
- grading

The handbook page explains the forecasting model vs. the drafter, no-vig probability, expected value, strength grades, and the unvalidated label. The testing docs describe the fixture forecasting model.

**Blocked by:** 06, 09, 11

**Status:** ready-for-agent

- [ ] README describes the game board and model pick workflow and its honest limits
- [ ] AGENTS.md Journal and Release sections reflect ADR 0002 without loosening the release gate
- [ ] The handbook page covers the terms above using the glossary vocabulary
- [ ] `docs/testing.md` matches the actual verification setup
- [ ] `npm run verify` passes
