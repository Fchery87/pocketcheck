# 04: Checked thesis from a chosen model

**What to build:** In Settings the user can see TheClawBay and direct DeepSeek catalogs, including incompatible models and the time the catalog was retrieved. They can select a compatible model. Analyze drafts a sourced thesis from the frozen evidence packet. Invented citations and altered numbers are rejected. If drafting fails, the evidence and calculations remain usable. Keys never appear in the report.

**Blocked by:** 02: Source evidence packet

**Status:** resolved

- [x] Discovery lists every returned model. Incompatible entries stay visible with a reason and cannot draft a thesis.
- [x] grok-4.7 is preferred only when that account's catalog returns it. There is no silent provider or model switch.
- [x] The thesis may only cite evidence IDs in the packet and may not change deterministic prices, break-evens, or supplied probabilities.
- [x] Auth failures, rate limits, missing usage, malformed reports, and removed models are visible. Usage cost stays unknown when the provider omits it.
- [x] One bounded formatting repair is allowed. After that, drafting is failed and the evidence and calculations remain.
- [x] Automated tests use fixtures. No automated suite makes a paid model call.
- [x] Rendered output and exports do not contain API keys.

## Answer

TheClawBay and direct DeepSeek adapters discover catalogs through injectable fetch. `grok-4.7` is preferred only on TheClawBay when that id is present. Drafting omits the user lean, rejects unknown evidence ids, altered odds, and model-supplied probabilities, and allows one JSON repair. Failed drafts keep the packet and calculations. Tests use fixtures only. Verified by `tests/providers/thesis.test.ts` (10 tests) inside `npm test` (47 tests) on 2026-10-25.

## Comments

- 2026-10-25: Merged to `integrate/pocketcheck-mvp` from `ticket/04-checked-thesis`. A live account catalog call was not part of the automated suite.
