# PocketCheck

Personal sports handicapping research, beginning with NFL pregame moneylines, spreads, and totals. The user records an actual sportsbook offer, compares a sourced thesis with their own research, and tracks decisions and results.

Status: Task 1 toolchain proof passed on 2026-10-25. The local page, fixture server action, checks, tests, and production build work together. No probability model or betting advantage has been validated.

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

`npm run check`, `npm test`, and `npm run build` passed. The development server, Vite preview, and Node production server all returned the fixture game `Fixture Away at Fixture Home`.

Development does not enforce the production cross-site form check. Preview and the Node server do. The Node adapter treats requests as HTTPS unless a protocol is declared, so local HTTP needs `PROTOCOL_HEADER=x-forwarded-proto` and an `x-forwarded-proto: http` request header. Without it, or with a different request origin, the production form returns 403. Unknown routes return 404. Dev and preview bind to `127.0.0.1`; set `HOST=127.0.0.1` for the Node server because its default is all interfaces.

## Run locally

```sh
npm install
npm run dev
npm run check
npm test
npm run build
npm run preview
```

Node production server:

```sh
HOST=127.0.0.1 PORT=3000 PROTOCOL_HEADER=x-forwarded-proto node build/index.js
```

## Next implementation step

Implement market mathematics, Task 2 of the plan. No database, live source, or model call is connected yet.
