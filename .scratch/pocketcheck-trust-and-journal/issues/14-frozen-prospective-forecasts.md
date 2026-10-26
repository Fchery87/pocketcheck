# 14: Freeze prospective model inputs and forecasts

**What to build:** Save each research forecast with the exact model inputs and starter assumptions available at its decision cutoff, so later evaluation can inspect the original prediction without reconstructing it.

**Blocked by:** 02: Preserve immutable analysis snapshots, 03: Remove chronological leakage from model evaluation, 04: Reject invalid model artifacts and evaluation reports

**Status:** resolved

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 44, 46, 48.

- [x] Persist versioned feature values, input availability rules and evidence times, decision cutoff, artifact checksum and version, market eligibility, probabilities, uncertainty, and policy identity with the analysis.
- [x] Represent starter identities as known, assumed, or unknown with supporting timestamps. An archived actual starter without decision-time provenance does not become a known live input.
- [x] Use the validated artifact and corrected chronology from tickets 03 and 04. Keep ineligible model numbers subject to existing display restrictions.
- [x] Freeze a forecast before its applicable outcomes arrive. Later edits to the schedule, artifact, starter information, final score, or current policy cannot alter it.
- [x] Show forecast identity and assumption provenance in the report without implying an unreleased market is eligible.
- [x] Mark legacy forecasts with missing input provenance explicitly. Do not regenerate old forecasts and present them as originals.
- [x] Verify immutable readback and replay after changing every current input through the application workflow, shared storage contract, and public model pipeline.
- [x] Document the prospective forecast record and its known limitations without claiming independent performance evidence yet.

## Answer

Each completed analysis can store a version 1 prospective forecast on its snapshot: feature values, the `decision-time-starters-v1` availability rule, the decision cutoff, artifact checksum and version, starter state (`known`, `assumed`, or `unknown`) with evidence time, market eligibility, probabilities, uncertainty, and policy identity. Archived schedule starters without decision-time evidence stay unknown and do not become known live inputs. Replay returns the saved record after the current artifact, schedule, starters, score, offer, and policy change. A null forecast is labeled as missing input provenance and is not regenerated as an original. Ineligible probabilities stay off the report. The record is not independent performance evidence and does not implement the ticket 17 release gate. See [model evaluation](../../../docs/research/model-evaluation.md).

Verified on `implement/t14`:

- `node_modules/.bin/vp test run tests/model/prospective-forecast.test.ts src/lib/server/analysis/store.test.ts src/lib/server/analysis/model.test.ts src/lib/server/analysis/run.test.ts` passed 61 tests.
- The model test that records an unreleased market also asserts archived starters stay unknown and eligibility stays false.
- Neon readback uses the same store contract. This session did not run the database job (`TEST_DATABASE_URL` was not set here).

