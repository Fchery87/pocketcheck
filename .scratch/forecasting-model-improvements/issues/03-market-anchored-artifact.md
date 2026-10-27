# 03: Market-anchored forecasting model (new artifact version)

**What to build:** A new artifact version whose forecasts start from the anchor line and fit only the deviation from it, per ADR 0003:

- **Moneyline:** the no-vig home win probability, mapped to an implied mean margin
- **Spread:** the home line as the mean margin
- **Total:** the total line as the mean total

History anchors on the recorded close, and rows without one are excluded and counted. At decision time the anchor comes from one sportsbook's two sides on the game board, and with no two-sided quote the market has no forecast and a visible reason. Model pick drivers show the adjustment from the anchor line by input group. Version 4 artifacts still load during this transition.

**Blocked by:** 01, model-picks 04

**Status:** ready-for-agent

- [ ] The new artifact kind and version record the anchor definition, chronology, feature definitions, fit, residuals, calibration, ablation results, and checksum; tampering is rejected
- [ ] Anchor arithmetic per market is tested on fixtures, with excluded no-close rows counted in the report
- [ ] The evaluation report compares against the no-vig close and the version 4 artifact on identical games, labeled development evidence
- [ ] The game board run passes its anchor line into the forecast, and the frozen forecast records it
- [ ] A board market without a two-sided quote gives no model pick with a reason, never a from-scratch fallback
- [ ] Model pick reasons show the adjustment from the anchor line by input group
- [ ] The research run and browser tests pass with the browser fixture forecasting model updated to the new version
- [ ] `npm run verify` and `npm run verify:database` pass
