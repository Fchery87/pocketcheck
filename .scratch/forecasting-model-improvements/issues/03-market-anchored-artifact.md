# 03: Market-anchored forecasting model (new artifact version)

**What to build:** A new artifact version whose forecasts start from the anchor line and fit only the deviation from it, per ADR 0003:

- **Moneyline:** the no-vig home win probability, mapped to an implied mean margin
- **Spread:** the home line as the mean margin
- **Total:** the total line as the mean total

History anchors on the recorded close, and rows without one are excluded and counted. At decision time the anchor comes from one sportsbook's two sides on the game board, and with no two-sided quote the market has no forecast and a visible reason. Model pick drivers show the adjustment from the anchor line by input group. Version 4 artifacts still load during this transition.

**Blocked by:** 01, model-picks 04

**Status:** resolved

- [x] The new artifact kind and version record the anchor definition, chronology, feature definitions, fit, residuals, calibration, ablation results, and checksum; tampering is rejected
- [x] Anchor arithmetic per market is tested on fixtures, with excluded no-close rows counted in the report
- [x] The evaluation report compares against the no-vig close and the version 4 artifact on identical games, labeled development evidence
- [x] The game board run passes its anchor line into the forecast, and the frozen forecast records it
- [x] A board market without a two-sided quote gives no model pick with a reason, never a from-scratch fallback
- [x] Model pick reasons show the adjustment from the anchor line by input group
- [x] The research run and browser tests pass with the browser fixture forecasting model updated to the new version
- [x] `npm run verify` and `npm run verify:database` pass

## Answer

Artifact version 5 fits the deviation from the anchor line. A market with no two-sided quote has no forecast, and version 4 files are rejected with a refit-required reason. A research analysis whose offer has no opposing price at its sportsbook has no forecast, and its page says so; enter both sides on a game board to freeze one.

Verified 2026-10-28 on `feature/forecasting-model-improvements`: `npm run verify` (540 unit tests, 31 browser tests) and `verify:database` (95 tests) pass.
