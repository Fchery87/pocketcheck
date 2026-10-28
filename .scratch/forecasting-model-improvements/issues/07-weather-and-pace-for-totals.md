# 07: Weather and pace for totals

**What to build:** The total forecast uses wind speed, precipitation probability, and temperature from the NWS snapshot already collected at analysis time, only for outdoor and open-roof venues. It also uses combined team pace and pass rate over expected. Past forecasts cannot be recreated, so weather enters as a documented, versioned fixed adjustment labeled as such until enough prospectively saved forecasts exist to fit it.

**Blocked by:** 02, 03

**Status:** resolved

- [x] Dome and closed-roof games ignore weather; a missing forecast for an outdoor game is a gap, never zero wind
- [x] The fixed weather adjustment is versioned in the artifact and labeled on the model pick card
- [x] Pace and pass rate over expected come from eligible play-by-play only, with an ablation result for that group
- [x] The frozen forecast records the weather snapshot used
- [x] Model pipeline and research run tests cover outdoor-only application and the recorded snapshot
- [x] `npm run verify` passes

## Answer

A dome or closed roof ignores the forecast; an outdoor game records the collected wind, precipitation, and temperature on the frozen forecast, and a missing forecast is a gap. Deviation from the ticket: no points are applied (`weather-unfitted-v1`), because no prospective snapshots exist to fit and the handbook refuses an invented number. The card says so. Pace is not part of this answer.

Verified 2026-10-28 on `feature/forecasting-model-improvements`: `npm run verify` (540 unit tests, 31 browser tests) and `verify:database` (95 tests) pass.
