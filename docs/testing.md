# Verify a change

Use Node 24 and install dependencies with `npm ci`. Install Chromium once with `npx playwright install --with-deps chromium`.

Run the application checks with one command.

```sh
npm run verify
```

This command runs formatting, lint, TypeScript and Svelte checks, unit tests, the production build, and Playwright acceptance in that order. A failed step stops verification. Unit checks run the density-grid throughput case in a separate process after the other unit tests finish, retaining its existing time limit. CI's `application` job invokes this same command. Model-fitting reproducibility tests retain exact comparisons and have an explicit 60-second budget per test.

The browser server uses the built Node adapter on `http://127.0.0.1:42627` with `PROTOCOL_HEADER=x-forwarded-proto`. Browser requests send `x-forwarded-proto: http` so the adapter derives the correct origin. Acceptance covers a successful same-origin form submission and a mismatched-origin rejection. No development server is reused.

Acceptance also starts the documented `npm start` launcher (`scripts/start.ts`) on port 42628 with the same fixture journal and outbound guard. Without `HOST` it must listen on `127.0.0.1` and accept a form posted from its own origin with no forwarded-protocol header, as a browser sends it. With `HOST=0.0.0.0` it must log the no-login warning, accept a form whose origin matches the network address in the `Host` header, and reject a different origin with 403. A unit test checks that dev and preview bind to `127.0.0.1`.

The verification runner passes a clean environment to each subprocess. Provider keys and database URLs are blank, including during build, so local `.env` values cannot fill them. The browser server requires `POCKETCHECK_TEST_MODE=fixture-browser`, a memory journal with a unique `browser-` identity, the fixed clock `2026-10-25T16:00:00.000Z`, and the checked-in schedule and injury fixtures. Weather is off. Its fetch guard rejects all outbound requests. A negative test invokes the real DeepSeek provider adapter and proves its request is stopped before transport.

The forecasting model is the checked-in fixture `tests/fixtures/models/browser-forecasting-model.json`. It is the unreleased artifact `npm run model:fit` produces from `tests/model/fixtures/synthetic-games.json`, trained through `2024-09-22T17:00:00Z`, and it is read from disk with no outbound request. Startup checks the configured path, the artifact's own checksum, the pinned checksum, the release status, and the training cutoff, and refuses anything else, including `off`. Because the artifact is unreleased, a research analysis still records its probabilities and frozen forecast but shows no value conclusion. To refit the fixture, rerun `npm run model:fit -- tests/model/fixtures/synthetic-games.json tests/fixtures/models/browser-forecasting-model.json`, format it, and update the pinned identity in `src/lib/server/verification.ts` and the browser test.

Before each browser test, `/__verification` checks the effective SvelteKit environment, the fixture forecasting model's identity, and the selected drafter. The test compares the server's journal identity with this run's identity before any research submission. This endpoint returns 404 outside verification mode. Startup rejects unexpected fixture configuration before the server listens.

Use separate dependency directories for separate worktrees. SvelteKit writes generated environment types and route configuration under `node_modules/$app`. Sharing a `node_modules` symlink shares that mutable configuration between checkouts.

## Verify database storage

Create disposable PostgreSQL storage. Export its connection string explicitly, then run the database checks.

```sh
TEST_DATABASE_URL='postgresql://test_user:password@localhost/test_database?sslmode=disable' npm run verify:database
```

Use `sslmode=disable` only when the disposable server does not support TLS. Other connections require TLS. Integration tests never load `.env` and never use `DATABASE_URL` as a fallback. Missing `TEST_DATABASE_URL` fails the command.

Each test creates a random `it_` schema, applies every SQL migration there, and runs the shared storage contracts and journal recovery checks. Cleanup drops only the schema that test created, including after a migration failure. The public schema is untouched.

CI's separate `database` job provisions a PostgreSQL 16 service with a disposable database, explicitly sets `TEST_DATABASE_URL`, and invokes `npm run verify:database`. Both jobs must pass before the change is considered verified. Repository maintainers must require both jobs in branch protection.

## Journal backup

The journal page downloads `/journal/export` as `pocketcheck-journal-v1.json`. Format version is `1`. Version 1 is the only backup restore accepts.

The file contains games, offers, evidence used by analyses, analysis identifiers, original timestamps, parent links, immutable snapshots, gaps, manual coverage, and policy results. It also contains actual-bet contracts and stakes, primary classifications, closing observations, settlement and correction history, frozen forecasts, and provider attempt accounting. Failed, interrupted, and ambiguous attempts stay in the file with their durable responses.

Legacy records keep their saved provenance limits. Export does not fill in facts the record does not have.

The file does not contain provider credentials, credential-bearing request headers, application settings, bulk source caches, or model training datasets. Forecast identity and the recorded inputs needed to recover a forecast stay in the snapshot.

Restore checks the version, record shapes, identifiers, relationships, snapshots, and event histories before it writes. A valid file is applied atomically. Restoring the same file again keeps one copy of each identical record. A malformed record, a missing relationship, an unsupported version, or a conflicting identifier is rejected and leaves the destination unchanged. Conflicting identifiers are not replaced.

A restored pending or ambiguous attempt stays readable. Restore does not call a source or a provider and does not replay that work.

Reachable recovery is the journal page form, which posts a version 1 file to `?/restore`. The download itself does not write.

## Keep live experiments separate

Automated acceptance uses the deterministic fixture drafter. To experiment with a live provider, use the normal application and its Settings page with your own credentials and journal. Such requests can incur provider charges. A live result does not replace isolated verification or establish model eligibility.
