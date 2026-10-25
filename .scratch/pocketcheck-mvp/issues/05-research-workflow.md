# 05: Research workflow

**What to build:** The user can pick a future NFL game, enter a valid full-game offer and an optional private lean, run analysis, read a sourced thesis or an explicit pass, wait, or insufficient-evidence result, and refresh at a new price without changing the earlier report. The journal separates system assessments from actual bets. The handbook explains the formulas next to the workflow.

**Blocked by:** 03: Immutable research journal, 04: Checked thesis from a chosen model

**Status:** claimed

- [ ] Analyze shows the game date, kickoff, timezone, venue, and home and away teams, and rejects a game that has already started.
- [ ] The optional initial lean is saved and compared only after the independent report exists. It is absent from the evidence packet.
- [ ] Progress shows checking inputs, collecting evidence, computing, drafting, and checking the report. Interrupted runs stay interrupted until an explicit retry.
- [ ] A browser test enters an offer, analyzes against fixtures, inspects citations and missing evidence, refreshes a changed price, and confirms the prior report is unchanged.
- [ ] Journal lists every completed assessment, including passes. Recording an actual bet is a separate action.
- [ ] Handbook pages explain odds, margin, expected value, pushes, and the matching report calculations.
- [ ] The Playwright command is a real suite, not a placeholder.
