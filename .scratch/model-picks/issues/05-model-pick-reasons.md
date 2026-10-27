# 05: Model pick reasons: forecast drivers, gaps, manual evidence, private lean

**What to build:** Each model pick card explains itself in numbers. It lists the inputs that moved the forecast most, with signed point effects, and the evidence gaps for the game. The board accepts optional manual evidence and an optional private lean before submission, using the existing rules. Missing material evidence keeps a pick from being graded strong.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] The forecasting model's prediction returns per-feature contributions to the predicted margin and total, recorded in the frozen forecast
- [ ] Each card shows the largest contributors for its market and the gaps
- [ ] Manual evidence clears gaps under the existing team, source-time, and window rules; late or unrelated evidence stays visible and does not clear
- [ ] The private lean is saved separately and never enters the forecast, the evidence packet, or the model pick
- [ ] A material gap caps the grade at lean, covered in the boundary tests
- [ ] Run-level tests assert the saved drivers, gaps, and capped grade
- [ ] `npm run verify` and `npm run verify:database` pass
