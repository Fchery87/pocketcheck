# 12: README, AGENTS.md, handbook, and testing docs

**What to build:** The project describes the game board accurately. README explains the difference between a research analysis and a model pick. AGENTS.md Journal rules cover:

- game board and model pick separation
- the primary model pick
- grading

The handbook page explains the forecasting model vs. the drafter, no-vig probability, expected value, strength grades, and the unvalidated label. The testing docs describe the fixture forecasting model.

**Blocked by:** 06, 09, 11

**Status:** resolved

- [x] README describes the game board and model pick workflow and its honest limits
- [x] AGENTS.md Journal and Release sections reflect ADR 0002 without loosening the release gate
- [x] The handbook page covers the terms above using the glossary vocabulary
- [x] `docs/testing.md` matches the actual verification setup
- [x] `npm run verify` passes

## Answer

README, AGENTS.md Journal and Release, the handbook, `docs/testing.md`, and the glossary now describe game boards and model picks. The glossary gained **primary model pick**. Export stays version 1, with boards as optional lists. The release gate and protocol `prospective-2026-10-26` are unchanged. `npm run verify` passed on this worktree.
