# 07: Experimental value decision

**What to build:** When the released baseline and the recorded price support it, the report can show an experimental expected value and the price that would change the conclusion. Otherwise it says pass, wait, or insufficient evidence and names the missing condition. The model may explain the decision. It cannot invent or replace the probabilities or the policy conclusion.

**Blocked by:** 05: Research workflow, 06: Baseline probabilities

**Status:** resolved

- [x] Invalid offers, started games, missing material evidence, and unreleased artifacts cannot become value candidates.
- [x] Expected value uses the recorded price and the artifact probabilities. Missing value stays unavailable.
- [x] Sensitivity shows how a stated assumption change moves the estimate, without presenting it as proven edge.
- [x] A worse price or a missing material fact changes the applicable conclusion. The previous report remains unchanged.
- [x] Every numerical report is labeled experimental and links its method, artifact, and evaluation limits.
- [x] Thresholds used by the policy are versioned and not described as scientifically established by this spec.

## Answer

`decideValue` in `src/lib/server/analysis/policy.ts` is version `policy-2026-10-25`. It returns pass, wait, or insufficient evidence unless the offer is valid, the game has not started, material evidence is present, and the artifact is released. Expected value uses the recorded decimal odds and the artifact probabilities. Missing value stays null. Sensitivity shows a stated probability shift as experimental. Report validation rejects a thesis conclusion that disagrees with the policy. Tests: 7 policy, 3 sensitivity, plus the thesis disagreement case. `npm test` on the integration branch: 62 passed. The threshold is versioned, not claimed as established.

## Comments

- 2026-10-25: Merged to `integrate/pocketcheck-mvp` from `ticket/07-experimental-value`.
