# PocketCheck

Personal sports handicapping research, beginning with NFL pregame moneylines, spreads, and totals. The user records an actual sportsbook offer, compares a sourced thesis with their own research, and tracks decisions and results.

Status (2026-10-25): the research workflow runs end to end on the real nflverse schedule and saves every run to Neon. You pick an upcoming game, enter an offer, your own evidence, and an optional private lean, and get a report with price mathematics, cited evidence, evidence gaps, and the policy conclusion. Each run collects the nflverse injury report for both teams and the NWS kickoff forecast for U.S. outdoor venues. Refreshes keep the earlier report unchanged. No probability model or betting advantage has been validated.

Each analysis stores a versioned snapshot of its game and exact research offer, so reloading the schedule does not rewrite an existing report or journal entry. Legacy entries are frozen from the schedule available at migration time and marked with unknown original provenance; their original kickoff and venue cannot be confirmed. The private lean remains stored separately from the evidence packet and thesis.

Theses are drafted by the model you choose in Settings (TheClawBay or DeepSeek), or by a deterministic fixture drafter that makes no AI call. Settings lists each provider's catalog with its retrieval time. A model can draft only when its catalog declares text output (DeepSeek) or it passes a one-request JSON test (TheClawBay declares nothing). There is no automatic fallback: a missing key or a removed model stops the analysis with the reason. Each report shows its token usage and provider-reported cost, or says none was reported.

Not yet wired into the app: the baseline model; settlement, closing-line comparison, and summaries.

## Start here

1. [Implementation plan](docs/plans/2026-10-25-pocketcheck-implementation.md): architecture, records, delivery gates, and nine ordered implementation tasks.
2. [Handicapping handbook](docs/research/2026-10-25-handicapping-fundamentals.md): research methods, NFL fundamentals, odds, expected value, uncertainty, and evaluation.
3. [Free NFL data audit](docs/research/2026-10-25-free-nfl-data-audit.md): sources, sampled versus documented availability, historical limitations, and manual fallbacks.
4. [Stack and AI feasibility](docs/research/2026-10-25-stack-and-ai-feasibility.md): SvelteKit, Vite+, Neon, TheClawBay, and direct DeepSeek.
5. [Confirmed MVP specification](.scratch/pocketcheck-mvp/spec.md): decisions and acceptance scenarios agreed with the user.

## Agreed approach

- Run locally with SvelteKit and Vite+; store compact journal records in Neon and large datasets locally.
- Use free sports data and infrastructure allowances, plus the user's existing AI services. Included API/search usage remains account-specific.
- Compute mathematics in code. Use AI to explain supplied evidence with traceable sources and explicit opposing evidence.
- Permit pass, wait, and insufficient-evidence outcomes. Label model-derived probabilities as experimental until evaluation supports stronger claims.
- Preserve original prices, evidence, report versions, and all completed analyses. Record actual bets separately in units.
- Prove a research workflow before expanding to NBA, college football, college basketball, and MLB.

## Toolchain

Verified together on Node 24.15.0 and npm 11.19.0:

- Vite+ 1.4.0, which supplies the Vite command and Vitest 5.0.5
- SvelteKit 3.1.0 and Svelte 5.57.2
- `@sveltejs/adapter-node` 6.0.0, TypeScript 6.0.3, and svelte-check 4.7.7

SvelteKit 3 keeps configuration in `vite.config.ts`. There is no `svelte.config.js`. The `#lib` package import is the library alias. Server-only code lives under `src/lib/server` and imports include the `.ts` extension.

Development does not enforce the production cross-site form check. Preview and the Node server do. The Node adapter treats requests as HTTPS unless a protocol is declared, so local HTTP needs `PROTOCOL_HEADER=x-forwarded-proto` and an `x-forwarded-proto: http` request header. Without it, or with a different request origin, the production form returns 403. Unknown routes return 404. Dev and preview bind to `127.0.0.1`; set `HOST=127.0.0.1` for the Node server because its default is all interfaces.

## Run locally

```sh
npm install
cp .env.example .env      # then set DATABASE_URL to your Neon connection string
npm run db:migrate        # applies migrations/ in order
npm run data:schedule     # downloads the nflverse schedule to data/sources/games.csv
npm run data:injuries     # downloads this season's nflverse injury report; re-run before analyzing
npm run model:fit -- data/sources/games.csv data/artifacts/baseline.json 2022-03-01T00:00:00Z
npm run dev
```

The app needs `DATABASE_URL`. It shows an error rather than silently keeping the journal in memory. Re-run `npm run data:schedule` to pick up schedule changes; each download records its retrieval time in a `.json` file beside it.

Injury coverage is tracked per team and game week. Rows for one team do not cover its opponent. An absent player row is unknown coverage, not a clean report. A clean empty report is accepted only when the source marks that team and week as explicitly empty. Injury coverage older than 24 hours stays a material gap. The download time is the retrieval time. It is shown separately from publication time, and it does not establish when the source published the report. nflverse rows keep publication time unknown. Manual evidence clears an injury gap only when it names that team, has a source time, and that source time is within 24 hours of the decision cutoff and not after it. Weather keeps a 12-hour manual window and does not need a team. Stale, late, unrelated, and unknown-time evidence stays visible and does not clear the gap. A malformed or empty weather payload is recorded as a gap. The rest of the analysis remains readable.

Weather is fetched from api.weather.gov at analysis time; set `NWS_USER_AGENT` to identify yourself with an email, as NWS asks. International venues have no NWS forecast and show that as a gap.

Verification uses the same entry points locally and in CI. See [Verify a change](docs/testing.md) for isolation checks and database setup.

```sh
npm run verify            # format, lint, types, unit tests, production build, browser acceptance
TEST_DATABASE_URL=... npm run verify:database  # disposable storage only, all migrations and contracts
```

Node production server:

```sh
HOST=127.0.0.1 PORT=3000 PROTOCOL_HEADER=x-forwarded-proto node --env-file=.env build/index.js
```

## Next implementation step

The P1 and P2 items from the 2026-10-25 review are done. The baseline is now fit and scored on real nflverse games against the no-vig closing market, and it still loses to that market (see `docs/research/model-evaluation.md`). Research runs record the model's probabilities, a slate-aware uncertainty, and a conservative expected value checked against a frozen threshold. Only a market that passes the release gate can become a value candidate, and on today's numbers no market passes. Next: a model that beats the no-vig closing market, and using the injury report to tell when a team's usual quarterback will not start.
