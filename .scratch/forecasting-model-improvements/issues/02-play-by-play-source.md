# 02: Play-by-play source and per-game team summaries

**What to build:** A `data:` command downloads nflverse play-by-play season files to the local data directory with a sidecar retrieval record and license. They are parsed at the edge into compact per-game team summaries:

- offensive and defensive EPA per play, split by passing and rushing
- success rate and early-down EPA
- explosive play rate
- pace (seconds per play) and pass rate over expected
- turnover and fumble-recovery counts

Malformed or missing files become visible gaps. Large files never enter Neon.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] The download command records retrieval time separately from publication time, plus dataset license and attribution
- [x] Parsing turns small checked-in samples into per-game team summaries with verified denominators
- [x] Malformed, empty, and missing season files produce gaps; other seasons remain readable
- [x] Summaries for a game are available only under the existing result-availability chronology
- [x] Source tests follow the existing injury and NWS source test style
- [x] The free data audit notes play-by-play as used
- [x] `npm run verify` passes

## Answer

`npm run data:play-by-play` downloads a season to the local data directory with a retrieval record; `src/lib/server/sources/play-by-play.ts` parses it into per-game team summaries. Covered by `tests/sources/play-by-play.test.ts`.

Verified 2026-10-28 on `feature/forecasting-model-improvements`: `npm run verify` (540 unit tests, 31 browser tests) and `verify:database` (95 tests) pass.
