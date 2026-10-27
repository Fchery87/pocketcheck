# 08: Injuries weighted by snap share and position

**What to build:** A snap count source feeds an injury impact per team and unit. Each player listed out or doubtful before the cutoff is weighted by recent snap share times a position value (the quarterback is handled by the starter state). Practice participation trend counts where published before the cutoff, and missing offensive line starters are counted. Kept only if the ablation shows a gain.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] A data command and edge parser for snap counts, with a retrieval record, license, and gaps
- [ ] Injury impact uses only designations and snaps known before the cutoff; tested for no leakage
- [ ] Position values are versioned in feature parameters
- [ ] Injury coverage gaps keep the existing per-team rules; absent rows are unknown, not healthy
- [ ] The ablation result and keep or drop decision are recorded
- [ ] `npm run verify` passes
