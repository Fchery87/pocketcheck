# Keep release authorization separate from predictive identity

This extends ADR 0004's deployment representation. Its registration and release criteria do not change.

## Decision

The registered predictor keeps its exact original bytes and checksum. The legacy full-artifact checksum algorithm still includes historical `releaseStatus` and `releasedMarkets` fields. Those fields remain readable historical data, not current release authority.

`model:release` writes a new version 1 release attestation instead of a modified predictor. The attestation binds the unchanged artifact checksum, registration, frozen protocol, released markets, recomputed evaluation, and a complete local journal evidence bundle. The bundle and attestation each have an integrity checksum. Output creation is exclusive and cannot replace an input or existing output.

Creation and verification both validate the evidence graph, reconstruct the qualified prospective sample, and recompute the frozen release gate. Verification compares the complete reconstructed attestation with the supplied one. A supplied verdict or matching integrity checksum alone never authorizes eligibility. Rehashing a failing bundle does not make it pass. These hashes establish local content identity, not independent authenticity of the source journal.

Runtime eligibility accepts only a separate in-process verified attestation capability bound to the predictor and market. Copying or deserializing that capability does not preserve verification. Imported attestation JSON must pass verification again. The capability and its market list are immutable. Future frozen forecasts must record the attestation checksum independently of predictive identity. No cache may be keyed only by an editable verdict or artifact release flag.

## Consequences

Releasing one market cannot change the predictor checksum used by another market's registration or forecasts. Historical forecasts and registrations are not rebound. Legacy released artifacts without verified separate evidence fail closed for new value recommendations.

The attestation embeds a full source journal rather than depending on external files whose availability could change. This costs storage and verification time but keeps qualification locally reproducible. An attestation is a deployment file, not a journal record, so version 1 journal backup collections do not change.

Only `prospective-2026-10-26` can authorize release. Synthetic passing evidence verifies this mechanism and releases no production market. Deploying a predictor, registering it, or enabling a release remains a separate authorized operation.

## Verification

The release regression first demonstrates that raw historical release flags incorrectly authorized eligibility. Focused tests then cover unchanged predictor identity, market-specific authorization, complete evidence verification, rehashed altered verdicts and failing evidence, changed registration and predictor bindings, and exclusive command output. No production artifact, registration, database, or paid request is involved.
