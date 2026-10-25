# 04: Checked thesis from a chosen model

**What to build:** In Settings the user can see TheClawBay and direct DeepSeek catalogs, including incompatible models and the time the catalog was retrieved. They can select a compatible model. Analyze drafts a sourced thesis from the frozen evidence packet. Invented citations and altered numbers are rejected. If drafting fails, the evidence and calculations remain usable. Keys never appear in the report.

**Blocked by:** 02: Source evidence packet

**Status:** ready-for-agent

- [ ] Discovery lists every returned model. Incompatible entries stay visible with a reason and cannot draft a thesis.
- [ ] grok-4.7 is preferred only when that account's catalog returns it. There is no silent provider or model switch.
- [ ] The thesis may only cite evidence IDs in the packet and may not change deterministic prices, break-evens, or supplied probabilities.
- [ ] Auth failures, rate limits, missing usage, malformed reports, and removed models are visible. Usage cost stays unknown when the provider omits it.
- [ ] One bounded formatting repair is allowed. After that, drafting is failed and the evidence and calculations remain.
- [ ] Automated tests use fixtures. No automated suite makes a paid model call.
- [ ] Rendered output and exports do not contain API keys.
