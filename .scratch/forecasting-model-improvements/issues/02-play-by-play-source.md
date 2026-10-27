# 02: Play-by-play source and per-game team summaries

**What to build:** A `data:` command downloads nflverse play-by-play season files to the local data directory with a sidecar retrieval record and license. They are parsed at the edge into compact per-game team summaries:

- offensive and defensive EPA per play, split by passing and rushing
- success rate and early-down EPA
- explosive play rate
- pace (seconds per play) and pass rate over expected
- turnover and fumble-recovery counts

Malformed or missing files become visible gaps. Large files never enter Neon.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The download command records retrieval time separately from publication time, plus dataset license and attribution
- [ ] Parsing turns small checked-in samples into per-game team summaries with verified denominators
- [ ] Malformed, empty, and missing season files produce gaps; other seasons remain readable
- [ ] Summaries for a game are available only under the existing result-availability chronology
- [ ] Source tests follow the existing injury and NWS source test style
- [ ] The free data audit notes play-by-play as used
- [ ] `npm run verify` passes
