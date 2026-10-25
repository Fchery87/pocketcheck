# 05: Research workflow

**What to build:** The user can pick a future NFL game, enter a valid full-game offer and an optional private lean, run analysis, read a sourced thesis or an explicit pass, wait, or insufficient-evidence result, and refresh at a new price without changing the earlier report. The journal separates system assessments from actual bets. The handbook explains the formulas next to the workflow.

**Blocked by:** 03: Immutable research journal, 04: Checked thesis from a chosen model

**Status:** resolved

- [x] Analyze shows the game date, kickoff, timezone, venue, and home and away teams, and rejects a game that has already started.
- [x] The optional initial lean is saved and compared only after the independent report exists. It is absent from the evidence packet.
- [x] Progress shows checking inputs, collecting evidence, computing, drafting, and checking the report. Interrupted runs stay interrupted until an explicit retry.
- [x] A browser test enters an offer, analyzes against fixtures, inspects citations and missing evidence, refreshes a changed price, and confirms the prior report is unchanged.
- [x] Journal lists every completed assessment, including passes. Recording an actual bet is a separate action.
- [x] Handbook pages explain odds, margin, expected value, pushes, and the matching report calculations.
- [x] The Playwright command is a real suite, not a placeholder.

## Answer

Analyze, report, journal, and handbook routes run against fixture games and an in-memory journal so the browser test does not call Neon or a live model. The lean is stored apart from the evidence packet. A refresh creates a new report and leaves the prior text in place. `npm run test:e2e` runs Playwright. The research-flow spec passed once on 2026-10-25. The browser flow does not yet persist through the Neon repository. That remains for prospective tracking.

## Comments

- 2026-10-25: Merged to `integrate/pocketcheck-mvp` from `ticket/05-research-workflow`.
