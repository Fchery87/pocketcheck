# 04: Quarterback starter state

**What to build:** Depth chart and roster sources feed a starter state for each team: known, assumed, or unknown, with the source and source time. An out or doubtful designation for the usual starter, published before the cutoff, makes the depth-chart backup the assumed starter. A timestamped depth chart before the cutoff makes the starter known. Conflicting sources make it unknown, which is a material gap that caps the model pick below strong. The frozen forecast records the starter state.

**Blocked by:** 03, model-picks 05

**Status:** resolved

- [x] Data commands and edge parsers exist for weekly depth charts and rosters, with retrieval records, licenses, and gaps for bad payloads
- [x] Starter state rules are tested, including a later designation or depth chart that never changes an earlier forecast
- [x] Depth charts are used live only where timestamped (2025 onward); training falls back to the assumed-starter rule
- [x] An unknown starter is a material gap and the model pick grade is capped at lean
- [x] The frozen forecast extends the existing starter assumption record with state, source, and time
- [x] The model pick card shows each team's starter state
- [x] `npm run verify` and `npm run verify:database` pass

## Answer

- `npm run data:depth-charts [season]` downloads the nflverse depth chart with a retrieval record, license, checksum, and gaps; the parser in `src/lib/server/sources/roster.ts` reports a gap for an empty or unusable file. Rosters are not downloaded separately: the depth chart already carries the player ids the rules need.
- `starterDecision` (tests in `tests/model/starter.test.ts`) uses the latest timestamped chart strictly before the cutoff; later charts never apply. Before 2025 it falls back to the most frequent recent starter.
- The live forecast (`createArtifactForecast`) now reads `data/sources/depth_charts_<season>.csv` and freezes `state`, `identity`, `evidenceAt`, and `source` (and `reason` when unknown) for each team. A starter assumed from history is stamped with the kickoff of the quarterback's latest start.
- An unknown starter caps a strong grade at lean (existing `board-run.ts` rule). The board pick card now lists each team's starter state.
- Deviation: the injury report is not an input to the live decision, because the nflverse injury file has no publication time and so cannot prove a designation came before the cutoff. `starterDecision` still accepts timestamped designations (a manual club report could supply them later).
