# 06: Drafter explanation for model picks

**What to build:** After the model picks are frozen, the selected drafter (TheClawBay, DeepSeek, or the fixture drafter) writes a plain-language explanation for each pick, including the strongest case for the other side, from supplied evidence only. The page names the forecasting model that chose the side and the drafter and model ID that wrote the text. An explanation that contradicts the frozen pick fails the run visibly, and the pick is kept.

**Blocked by:** 05

**Status:** resolved

- [x] The drafter contract gains a pick-explanation draft, implemented by all three drafters with no automatic fallback
- [x] The packet contains the frozen picks, numbers, drivers, evidence, and gaps, and excludes the private lean
- [x] Validation rejects text naming a different side, grade, or number; the run fails with the board and picks kept
- [x] The board attempt is saved before evidence collection and picks are saved before drafting; recovery reuses a saved provider response; ambiguous outcomes need a deliberate new attempt
- [x] Provider accounting sums the draft and repairs, and unknown usage stays unknown
- [x] Forecasting model identity (artifact checksum) and drafter identity are shown separately on the pick page
- [x] Run-level tests cover packet contents, contradiction failure, recovery, and accounting; the browser test sees the fixture explanation
- [x] `npm run verify` and `npm run verify:database` pass

## Answer

Picks are frozen before drafting, and the selected drafter (TheClawBay, DeepSeek, or the fixture drafter) then writes the explanation from a packet that has no lean parameter. A contradicting explanation leaves the board `failed` with picks kept and no explanation saved.
Migration 017 adds the drafter identity, provider requests, outcome, usage, and explanation to `game_boards`. The pick page shows a "Who wrote what" section.
Prose validation uses regex heuristics (an unsupplied percentage, signed price or line, grade, or side is rejected), so it catches stated numbers but not every paraphrase.
