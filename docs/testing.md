# Verify a change

Use Node 24 and install dependencies with `npm ci`. Install Chromium once with `npx playwright install --with-deps chromium`.

Run the application checks with one command.

```sh
npm run verify
```

This command runs formatting, lint, TypeScript and Svelte checks, unit tests, the production build, and Playwright acceptance in that order. A failed step stops verification. Unit checks run the density-grid throughput case in a separate process after the other unit tests finish, retaining its existing time limit. CI's `application` job invokes this same command. Model-fitting reproducibility tests retain exact comparisons and have an explicit 60-second budget per test.

The browser server uses the built Node adapter on `http://127.0.0.1:42627` with `PROTOCOL_HEADER=x-forwarded-proto`. Browser requests send `x-forwarded-proto: http` so the adapter derives the correct origin. Acceptance covers a successful same-origin form submission and a mismatched-origin rejection. No development server is reused.

The verification runner passes a clean environment to each subprocess. Provider keys and database URLs are blank, including during build, so local `.env` values cannot fill them. The browser server requires `POCKETCHECK_TEST_MODE=fixture-browser`, a memory journal with a unique `browser-` identity, the fixed clock `2026-10-25T16:00:00.000Z`, and the checked-in schedule and injury fixtures. Weather and fitted models are off. Its fetch guard rejects all outbound requests. A negative test invokes the real DeepSeek provider adapter and proves its request is stopped before transport.

Before each browser test, `/__verification` checks the effective SvelteKit environment and selected drafter. The test compares the server's journal identity with this run's identity before any research submission. This endpoint returns 404 outside verification mode. Startup rejects unexpected fixture configuration before the server listens.

Use separate dependency directories for separate worktrees. SvelteKit writes generated environment types and route configuration under `node_modules/$app`. Sharing a `node_modules` symlink shares that mutable configuration between checkouts.

## Verify database storage

Create disposable PostgreSQL storage. Export its connection string explicitly, then run the database checks.

```sh
TEST_DATABASE_URL='postgresql://test_user:password@localhost/test_database?sslmode=disable' npm run verify:database
```

Use `sslmode=disable` only when the disposable server does not support TLS. Other connections require TLS. Integration tests never load `.env` and never use `DATABASE_URL` as a fallback. Missing `TEST_DATABASE_URL` fails the command.

Each test creates a random `it_` schema, applies every SQL migration there, and runs the shared storage contracts and journal recovery checks. Cleanup drops only the schema that test created, including after a migration failure. The public schema is untouched.

CI's separate `database` job provisions a PostgreSQL 16 service with a disposable database, explicitly sets `TEST_DATABASE_URL`, and invokes `npm run verify:database`. Both jobs must pass before the change is considered verified. Repository maintainers must require both jobs in branch protection.

## Keep live experiments separate

Automated acceptance uses the deterministic fixture drafter. To experiment with a live provider, use the normal application and its Settings page with your own credentials and journal. Such requests can incur provider charges. A live result does not replace isolated verification or establish model eligibility.
