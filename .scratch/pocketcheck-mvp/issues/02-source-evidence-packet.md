# 02: Source evidence packet

**What to build:** For a scheduled NFL game, PocketCheck can assemble a pregame evidence packet from verified public schedule data, a verified injury feed or an explicit manual fallback, and weather that applies to the venue, roof, and kickoff period. Each fact shows its source, retrieval time, and publication or effective time when the source actually supplies one. Missing, stale, and conflicting evidence stays visible. The packet can be built without an AI call.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] A minimized current-season schedule fixture covers game identity, kickoff in America/New_York, home and away teams, and venue. A future game has no invented final score.
- [x] Home-favored schedule spread signs are converted explicitly and tested. They are not treated as the user's selected-team line.
- [x] Current injury coverage is sampled. If the live feed cannot be verified, the manual path is the supported path and the gap is visible.
- [x] Weather is tied to venue coordinates, roof state, and the kickoff period. Closed-roof and out-of-coverage games do not inherit an irrelevant outdoor forecast.
- [x] Manual evidence records source text or URL, known source time, entry time, and an explicit manual origin.
- [x] Schema changes, missing publication time, timeouts, and conflicts between manual and automatic observations are tested and remain visible.
- [x] Fetches are bounded, cached with checksums, and cannot use games or facts after the decision cutoff.
- [x] A real future game can produce an evidence packet with coverage warnings and no model call.

## Answer

`src/lib/server/sources` turns a minimized nflverse schedule into games with America/New_York kickoffs and an explicit home line, keeps injury rows that are not the requested season as a visible manual gap, and applies a forecast only when the roof is open and a kickoff period exists. Packet assembly drops facts after the decision cutoff and keeps conflicts. Verified by `npx vp test run`: 37 tests on the merged branch, including 13 evidence-packet tests.

The injury fixture is a minimized stand-in. A live 2026 feed was not confirmed in this pass, so automatic injury coverage stays unverified and the manual path remains supported.

## Comments

- 2026-10-25: Implemented on `ticket/02-source-evidence` and merged with market mathematics before returning to `integrate/pocketcheck-mvp`.
