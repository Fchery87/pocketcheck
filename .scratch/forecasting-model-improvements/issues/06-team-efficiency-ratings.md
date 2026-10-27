# 06: Team efficiency ratings

**What to build:** Score-margin form is replaced or joined by efficiency ratings adjusted for opponent strength and updated after every eligible game:

- offense and defense, split by passing and rushing
- success rate and early-down EPA
- explosive play rate

Each season starts from last season's ratings shrunk toward average. Turnover luck is discounted by excluding fumble-recovery outcomes or regressing turnover margin, whichever wins the ablation. Each group is kept only if it improves held-out log loss.

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] The feature row contract holds: a later result never changes an earlier row
- [ ] Opponent adjustment and the preseason carry are versioned in feature parameters
- [ ] The ablation compares margin form, efficiency, and both; the chosen set is recorded in the evaluation note
- [ ] Model pipeline tests cover chronology, a planted signal, and the preseason carry
- [ ] `npm run verify` passes
