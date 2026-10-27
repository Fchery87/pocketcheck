# 01: Artifact comparison and ablation reporting

**What to build:** `model:evaluate` can compare a candidate artifact with a previous artifact on identical games, and report each input group's contribution by scoring with and without it. It reports log loss and Brier score with slate-clustered intervals per market. Historical holdout results are labeled development evidence. It works on today's artifact, so later tickets can show their gain or drop an input group that does not help.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The evaluation report gains a previous-artifact comparison on the identical game set, and rejects a comparison on mismatched games
- [ ] The evaluation report gains an ablation section per input group, with slate-clustered 90% intervals on the log-loss difference
- [ ] Reports label historical scores as development evidence; release still uses the existing gate and protocol
- [ ] Report parsing at the edge validates the new sections; malformed sections are rejected before writing output
- [ ] Model pipeline tests use checked-in fixtures, including a planted signal whose ablation shows a gain
- [ ] `npm run verify` passes
