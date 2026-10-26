# 04: Reject invalid model artifacts and evaluation reports

**What to build:** Reject invalid model records before they can price an offer or produce a released artifact. The application and release command explain the rejection without enabling recommendations.

**Blocked by:** None (can start immediately)

**Status:** resolved

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 45, 46.

- [x] Reproduce acceptance of null model evaluation scores through the public release boundary.
- [x] Parse external artifacts and evaluation reports into validated domain records. Check supported versions, required fields, valid probabilities, chronology, complete market records, and artifact identity.
- [x] Reject missing, null, nonfinite, negative, or inconsistent required scores and counts. Preserve legitimate zero-valued metrics.
- [x] Validate checksums in addition to record shape. A matching checksum does not allow malformed contents or an evaluation for a different artifact.
- [x] Invalid application artifacts produce a visible unavailable-model reason and no eligible model probabilities. The deterministic policy remains authoritative.
- [x] Invalid release inputs fail without creating or replacing a released output. Include valid passing and failing cases that prove the gate is active.
- [x] Verify through artifact loading and the public release command. Document supported input contracts and rejection behavior.

## Answer

Artifacts and version 1 evaluation reports now enter the model pipeline as unknown JSON and become validated domain records. Loading, evaluation, and release reject unsupported versions, missing fields, invalid probabilities, inconsistent scores or counts, incomplete markets, mismatched artifact identities, and invalid checksums. Required chronology matches the shared `CHRONOLOGY` policy. Older artifacts without it must be refit. Supported contracts and rejection behavior are documented in [model evaluation](../../../docs/research/model-evaluation.md#external-input-contracts).

The initial public release regression reproduced null scores producing a released artifact. The initial live-loading regression reproduced a null artifact throwing. Review also found that removing chronology and recomputing the checksum still allowed parsing and release. Both chronology omission tests failed before the correction and pass with chronology required in the artifact type and parser.

The public CLI tests prove invalid inputs create no output and preserve existing output. They include valid zero scores and valid losing evidence. Subprocess launch errors are asserted separately, so sandbox `EPERM` cannot count as a rejected model. Live loading returns a visible unavailable reason and no probabilities for malformed artifacts. The deterministic policy remains unchanged.

Verification passed after merging ticket 03:

- `npm test -- tests/model src/lib/server/analysis/model.test.ts src/lib/server/analysis/policy.test.ts src/lib/server/analysis/run.test.ts --testTimeout=60000` passed 143 tests across 15 files.
- Changed-file formatting and lint passed. Isolated Svelte type checking reported zero errors and warnings.
- The coordinator independently reran the 143-test suite, lint, types, and production build successfully.

`npm run check` stopped on formatting in the shared tracker map. The coordinator will format that map on integration and rerun the full check. This ticket does not claim that final integration check has passed.
