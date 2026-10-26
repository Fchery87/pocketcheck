# 12: Record and compare closing offers

**What to build:** Attach an identifiable closing offer to researched and actual contracts and show whether a direct price comparison is valid.

**Blocked by:** 09: Record complete actual-bet contracts

**Status:** ready-for-agent

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 33, 34, 35.

- [ ] Capture market, side, line, sportsbook, rules, odds, observation time, source, and linkage for closing observations. Preserve earlier observations.
- [ ] Use the established same-market, same-side, same-line, same-book, and compatible-rule requirements for direct comparison.
- [ ] Display different point-line movement separately. Do not report a different line as a directly comparable change in odds.
- [ ] Represent absent or incompatible closing observations as unavailable with a reason, never as zero closing performance.
- [ ] Do not label archived untimestamped closing data as an executable offer or as a timestamped user observation.
- [ ] Verify comparable and incompatible examples and missing observations through browser entry, persistent readback, and the application journal boundary.
- [ ] Document what a closing comparison measures and the evidence required to make one.
