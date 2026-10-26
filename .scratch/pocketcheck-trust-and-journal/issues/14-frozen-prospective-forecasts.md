# 14: Freeze prospective model inputs and forecasts

**What to build:** Save each research forecast with the exact model inputs and starter assumptions available at its decision cutoff, so later evaluation can inspect the original prediction without reconstructing it.

**Blocked by:** 02: Preserve immutable analysis snapshots, 03: Remove chronological leakage from model evaluation, 04: Reject invalid model artifacts and evaluation reports

**Status:** ready-for-agent

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 44, 46, 48.

- [ ] Persist versioned feature values, input availability rules and evidence times, decision cutoff, artifact checksum and version, market eligibility, probabilities, uncertainty, and policy identity with the analysis.
- [ ] Represent starter identities as known, assumed, or unknown with supporting timestamps. An archived actual starter without decision-time provenance does not become a known live input.
- [ ] Use the validated artifact and corrected chronology from tickets 03 and 04. Keep ineligible model numbers subject to existing display restrictions.
- [ ] Freeze a forecast before its applicable outcomes arrive. Later edits to the schedule, artifact, starter information, final score, or current policy cannot alter it.
- [ ] Show forecast identity and assumption provenance in the report without implying an unreleased market is eligible.
- [ ] Mark legacy forecasts with missing input provenance explicitly. Do not regenerate old forecasts and present them as originals.
- [ ] Verify immutable readback and replay after changing every current input through the application workflow, shared storage contract, and public model pipeline.
- [ ] Document the prospective forecast record and its known limitations without claiming independent performance evidence yet.
