# 12: Record and compare closing offers

**What to build:** Attach an identifiable closing offer to researched and actual contracts and show whether a direct price comparison is valid.

**Blocked by:** 09: Record complete actual-bet contracts

**Status:** resolved

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 33, 34, 35.

- [x] Capture market, side, line, sportsbook, rules, odds, observation time, source, and linkage for closing observations. Preserve earlier observations.
- [x] Use the established same-market, same-side, same-line, same-book, and compatible-rule requirements for direct comparison.
- [x] Display different point-line movement separately. Do not report a different line as a directly comparable change in odds.
- [x] Represent absent or incompatible closing observations as unavailable with a reason, never as zero closing performance.
- [x] Do not label archived untimestamped closing data as an executable offer or as a timestamped user observation.
- [x] Verify comparable and incompatible examples and missing observations through browser entry, persistent readback, and the application journal boundary.
- [x] Document what a closing comparison measures and the evidence required to make one.

## Answer

Closing observations are append-only rows (migration 011) linked to a researched analysis or an actual bet. Each observed close stores market, side, line, sportsbook, rules, American odds, observation time, and source. Earlier observations stay when a later one is recorded.

A direct comparison is the change in decimal odds only when market, side, point line, sportsbook, and rules match. A different point line is shown as line movement and is not a comparable odds change. A missing close is unavailable, not zero. An archived price with no observation time is labeled as such and is not an executable offer or a timestamped observation.

Verified through the memory journal store and a production browser flow (comparable close, moved line, missing close, reload). The shared Neon contract still fails on completed-analysis immutability. That failure also happens on the pre-ticket integration tip. This ticket does not relax that trigger.
