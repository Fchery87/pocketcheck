# 02: Source evidence packet

**What to build:** For a scheduled NFL game, PocketCheck can assemble a pregame evidence packet from verified public schedule data, a verified injury feed or an explicit manual fallback, and weather that applies to the venue, roof, and kickoff period. Each fact shows its source, retrieval time, and publication or effective time when the source actually supplies one. Missing, stale, and conflicting evidence stays visible. The packet can be built without an AI call.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A minimized current-season schedule fixture covers game identity, kickoff in America/New_York, home and away teams, and venue. A future game has no invented final score.
- [ ] Home-favored schedule spread signs are converted explicitly and tested. They are not treated as the user's selected-team line.
- [ ] Current injury coverage is sampled. If the live feed cannot be verified, the manual path is the supported path and the gap is visible.
- [ ] Weather is tied to venue coordinates, roof state, and the kickoff period. Closed-roof and out-of-coverage games do not inherit an irrelevant outdoor forecast.
- [ ] Manual evidence records source text or URL, known source time, entry time, and an explicit manual origin.
- [ ] Schema changes, missing publication time, timeouts, and conflicts between manual and automatic observations are tested and remain visible.
- [ ] Fetches are bounded, cached with checksums, and cannot use games or facts after the decision cutoff.
- [ ] A real future game can produce an evidence packet with coverage warnings and no model call.
