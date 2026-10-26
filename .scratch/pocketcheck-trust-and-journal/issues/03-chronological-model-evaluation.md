# 03: Remove chronological leakage from model evaluation

**What to build:** Generate historical predictions using only information available at their decision cutoff. Simultaneous games and chronological evaluation folds cannot learn from one another's outcomes.

**Blocked by:** None (can start immediately)

**Status:** claimed

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 42, 43.

- [ ] Reproduce concurrent-outcome leakage through public feature or evaluation inputs before correcting it.
- [ ] Generate all feature rows in a shared kickoff group before applying any outcome from that group. Reordering games within the group leaves the corresponding pregame features and predictions unchanged.
- [ ] Changing a simultaneous game's final score does not affect another game's pregame prediction at that cutoff.
- [ ] Keep kickoff groups intact across chronological training and validation folds. No fold uses an outcome from its validation kickoff group for fitting or residual construction.
- [ ] Exclude earlier-started games when their result availability before the cutoff is not established. Preserve the evidence or explicit conservative availability rule used for eligible history.
- [ ] Verify corrected behavior through the public fitting and evaluation pipeline with known expected examples, including overlapping games and exact cutoff boundaries.
- [ ] Label previously affected evaluation results as superseded development evidence and update the documented chronological assumptions without claiming an improved betting advantage.
