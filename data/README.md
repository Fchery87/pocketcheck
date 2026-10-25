# Local source data

Large public downloads stay on this computer. Do not commit raw season files, play-by-play, or forecast caches.

`tests/fixtures/sources/` holds minimized samples used by the test suite. `scripts/data/import.ts` reads a local schedule CSV and prints an evidence-packet summary. It does not call the network.

Sampled on 2026-10-25, not stored here:

- nflverse `games.csv` included future 2026 rows. The minimized fixture keeps four of them.
- nflverse `injuries_2026.csv` returned 2026 rows for weeks 1–7 and no publication timestamp. Automatic injury evidence therefore keeps `publishedAt: unknown` and asks for a manual club report. A 2024 file is not 2026 coverage.
- NWS live JSON was not fetched. Weather tests use an NWS-shaped fixture. Closed roofs and empty periods stay irrelevant or missing.
