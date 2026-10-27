# 06: Drafter explanation for model picks

**What to build:** After the model picks are frozen, the selected drafter (TheClawBay, DeepSeek, or the fixture drafter) writes a plain-language explanation for each pick, including the strongest case for the other side, from supplied evidence only. The page names the forecasting model that chose the side and the drafter and model ID that wrote the text. An explanation that contradicts the frozen pick fails the run visibly, and the pick is kept.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] The drafter contract gains a pick-explanation draft, implemented by all three drafters with no automatic fallback
- [ ] The packet contains the frozen picks, numbers, drivers, evidence, and gaps, and excludes the private lean
- [ ] Validation rejects text naming a different side, grade, or number; the run fails with the board and picks kept
- [ ] The board attempt is saved before evidence collection and picks are saved before drafting; recovery reuses a saved provider response; ambiguous outcomes need a deliberate new attempt
- [ ] Provider accounting sums the draft and repairs, and unknown usage stays unknown
- [ ] Forecasting model identity (artifact checksum) and drafter identity are shown separately on the pick page
- [ ] Run-level tests cover packet contents, contradiction failure, recovery, and accounting; the browser test sees the fixture explanation
- [ ] `npm run verify` and `npm run verify:database` pass
