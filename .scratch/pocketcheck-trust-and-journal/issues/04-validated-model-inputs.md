# 04: Reject invalid model artifacts and evaluation reports

**What to build:** Reject invalid model records before they can price an offer or produce a released artifact. The application and release command explain the rejection without enabling recommendations.

**Blocked by:** None (can start immediately)

**Status:** claimed

**Type:** task

**Specification:** [Trustworthy research and complete journal](../spec.md).

**User stories:** 45, 46.

- [ ] Reproduce acceptance of null model evaluation scores through the public release boundary.
- [ ] Parse external artifacts and evaluation reports into validated domain records. Check supported versions, required fields, valid probabilities, chronology, complete market records, and artifact identity.
- [ ] Reject missing, null, nonfinite, negative, or inconsistent required scores and counts. Preserve legitimate zero-valued metrics.
- [ ] Validate checksums in addition to record shape. A matching checksum does not allow malformed contents or an evaluation for a different artifact.
- [ ] Invalid application artifacts produce a visible unavailable-model reason and no eligible model probabilities. The deterministic policy remains authoritative.
- [ ] Invalid release inputs fail without creating or replacing a released output. Include valid passing and failing cases that prove the gate is active.
- [ ] Verify through artifact loading and the public release command. Document supported input contracts and rejection behavior.
