# PocketCheck

Personal sports handicapping research, beginning with NFL pregame moneylines, spreads, and totals. The user records an actual sportsbook offer, compares a sourced thesis with their own research, and tracks decisions and results.

Status (2026-10-25): the research workflow runs end to end on the real nflverse schedule and saves every run to Neon. You pick an upcoming game, enter an offer and an optional private lean, and get a report with price mathematics, cited evidence, and the policy conclusion. Refreshes keep the earlier report unchanged. No probability model or betting advantage has been validated.

Not yet wired into the app: injury, weather, and manual evidence (every run reports them as missing, so the policy concludes insufficient evidence); live AI providers and the Settings catalog (reports come from a deterministic fixture drafter, labelled as such); the baseline model; settlement, closing-line comparison, and summaries.

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
npm run dev
```

The app needs `DATABASE_URL`. It shows an error rather than silently keeping the journal in memory. Re-run `npm run data:schedule` to pick up schedule changes; each download records its retrieval time in `data/sources/games.csv.json`.

Checks:

```sh
npm run check             # format, lint, and Svelte/type checks
npm test                  # unit tests, no database or network
npm run test:integration  # throwaway schemas in TEST_DATABASE_URL, or DATABASE_URL
npm run test:e2e          # browser suite: fixture schedule, memory journal, fixed clock
npm run build
```

Node production server:

```sh
HOST=127.0.0.1 PORT=3000 PROTOCOL_HEADER=x-forwarded-proto node --env-file=.env build/index.js
```

## Next implementation step

The remaining P1 items from the 2026-10-25 review: wire injury, weather, and manual evidence into runs, then connect real providers and the Settings catalog.
