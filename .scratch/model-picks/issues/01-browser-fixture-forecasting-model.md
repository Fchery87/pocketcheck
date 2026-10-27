# 01: Browser fixture forecasting model

**What to build:** Browser acceptance can exercise a forecasting model. `fixture-browser` mode loads a deterministic, checked-in forecasting model instead of none, and `/__verification` reports it. Startup still rejects any unexpected model configuration. Existing browser tests stay green. This is prefactoring for the game board's browser test.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `fixture-browser` mode loads a fixed forecasting model from checked-in test data and makes no outbound request
- [x] `/__verification` reports the fixture forecasting model in place of `model: "off"`, and the existing browser tests assert the new value
- [x] Startup rejects a non-fixture model path or configuration in `fixture-browser` mode, with a regression test
- [x] Existing research-flow acceptance still passes and still shows no released value conclusion
- [x] `docs/testing.md` describes the fixture forecasting model
- [x] `npm run verify` passes

## Answer

`fixture-browser` mode loads a checked-in, unreleased forecasting model artifact at `tests/fixtures/models/browser-forecasting-model.json`, fit from the synthetic fixture.
Its checksum (`56bd99b398f9…`) is pinned in `src/lib/server/verification.ts` and in the research-flow browser spec, which asserts that `/__verification` reports it.
Startup rejects anything else: `off`, another path, or an edited or re-released copy, even one with a recomputed checksum.
