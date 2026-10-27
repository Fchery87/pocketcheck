# 04: Quarterback starter state

**What to build:** Depth chart and roster sources feed a starter state for each team: known, assumed, or unknown, with the source and source time. An out or doubtful designation for the usual starter, published before the cutoff, makes the depth-chart backup the assumed starter. A timestamped depth chart before the cutoff makes the starter known. Conflicting sources make it unknown, which is a material gap that caps the model pick below strong. The frozen forecast records the starter state.

**Blocked by:** 03, model-picks 05

**Status:** ready-for-agent

- [ ] Data commands and edge parsers exist for weekly depth charts and rosters, with retrieval records, licenses, and gaps for bad payloads
- [ ] Starter state rules are tested, including a later designation or depth chart that never changes an earlier forecast
- [ ] Depth charts are used live only where timestamped (2025 onward); training falls back to the assumed-starter rule
- [ ] An unknown starter is a material gap and the model pick grade is capped at lean
- [ ] The frozen forecast extends the existing starter assumption record with state, source, and time
- [ ] The model pick card shows each team's starter state
- [ ] `npm run verify` and `npm run verify:database` pass
