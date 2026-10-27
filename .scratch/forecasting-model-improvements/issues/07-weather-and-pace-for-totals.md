# 07: Weather and pace for totals

**What to build:** The total forecast uses wind speed, precipitation probability, and temperature from the NWS snapshot already collected at analysis time, only for outdoor and open-roof venues. It also uses combined team pace and pass rate over expected. Past forecasts cannot be recreated, so weather enters as a documented, versioned fixed adjustment labeled as such until enough prospectively saved forecasts exist to fit it.

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] Dome and closed-roof games ignore weather; a missing forecast for an outdoor game is a gap, never zero wind
- [ ] The fixed weather adjustment is versioned in the artifact and labeled on the model pick card
- [ ] Pace and pass rate over expected come from eligible play-by-play only, with an ablation result for that group
- [ ] The frozen forecast records the weather snapshot used
- [ ] Model pipeline and research run tests cover outdoor-only application and the recorded snapshot
- [ ] `npm run verify` passes
