# 06: Team efficiency ratings

**What to build:** Score-margin form is replaced or joined by efficiency ratings adjusted for opponent strength and updated after every eligible game:

- offense and defense, split by passing and rushing
- success rate and early-down EPA
- explosive play rate

Each season starts from last season's ratings shrunk toward average. Turnover luck is discounted by excluding fumble-recovery outcomes or regressing turnover margin, whichever wins the ablation. Each group is kept only if it improves held-out log loss.

**Blocked by:** 02, 03

**Status:** resolved

- [x] The feature row contract holds: a later result never changes an earlier row
- [x] Opponent adjustment and the preseason carry are versioned in feature parameters
- [x] The ablation compares margin form, efficiency, and both; the chosen set is recorded in the evaluation note
- [x] Model pipeline tests cover chronology, a planted signal, and the preseason carry
- [x] `npm run verify` passes

## Answer

- Opponent-adjusted offense and defense EPA, a pass/rush split, success rate, early-down EPA, and explosive rate, each recency-weighted, shrunk toward the league mean, and carried between seasons at `seasonCarry`. The old code described its EPA as opponent-adjusted but did not adjust; `opponentAdjustment` now does, using the opponent's rating before the game.
- Tempo was also wrong (it averaged seconds remaining). It is now the clock gap between snaps of one drive.
- Ablation (2022-2025): team efficiency is the strongest input (all three markets); the split and quality groups help moneyline only and are kept; turnover margin showed nothing and is dropped.
- Deviation: the fumble-recovery-exclusion variant of turnover luck was not built; only regression toward zero was tested.
- The ablation harness did not forward the market anchor to the without-group forecast, so every earlier ablation compared anchored with unanchored forecasts. Fixed, with a regression test.
- Tests: chronology, opponent adjustment, preseason carry, split rates, turnover regression, and the play-by-play join.
