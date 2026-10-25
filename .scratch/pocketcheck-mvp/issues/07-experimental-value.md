# 07: Experimental value decision

**What to build:** When the released baseline and the recorded price support it, the report can show an experimental expected value and the price that would change the conclusion. Otherwise it says pass, wait, or insufficient evidence and names the missing condition. The model may explain the decision. It cannot invent or replace the probabilities or the policy conclusion.

**Blocked by:** 05: Research workflow, 06: Baseline probabilities

**Status:** ready-for-agent

- [ ] Invalid offers, started games, missing material evidence, and unreleased artifacts cannot become value candidates.
- [ ] Expected value uses the recorded price and the artifact probabilities. Missing value stays unavailable.
- [ ] Sensitivity shows how a stated assumption change moves the estimate, without presenting it as proven edge.
- [ ] A worse price or a missing material fact changes the applicable conclusion. The previous report remains unchanged.
- [ ] Every numerical report is labeled experimental and links its method, artifact, and evaluation limits.
- [ ] Thresholds used by the policy are versioned and not described as scientifically established by this spec.
