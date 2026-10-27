# 01: Browser fixture forecasting model

**What to build:** Browser acceptance can exercise a forecasting model. `fixture-browser` mode loads a deterministic, checked-in forecasting model instead of none, and `/__verification` reports it. Startup still rejects any unexpected model configuration. Existing browser tests stay green. This is prefactoring for the game board's browser test.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `fixture-browser` mode loads a fixed forecasting model from checked-in test data and makes no outbound request
- [ ] `/__verification` reports the fixture forecasting model in place of `model: "off"`, and the existing browser tests assert the new value
- [ ] Startup rejects a non-fixture model path or configuration in `fixture-browser` mode, with a regression test
- [ ] Existing research-flow acceptance still passes and still shows no released value conclusion
- [ ] `docs/testing.md` describes the fixture forecasting model
- [ ] `npm run verify` passes
