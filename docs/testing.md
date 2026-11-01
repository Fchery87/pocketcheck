# Verify a change

Use Node 24 and install dependencies with `npm ci`. Install Chromium once with `npx playwright install --with-deps chromium`.

Run the application checks with one command.

```sh
npm run verify
```

This command runs formatting, lint, TypeScript and Svelte checks, unit tests, the production build, and Playwright acceptance in that order. A failed step stops verification. Unit checks run the density-grid throughput case in a separate process after the other unit tests finish, retaining its existing time limit. CI's `application` job invokes this same command. Model-fitting reproducibility tests retain exact comparisons and have an explicit 60-second budget per test. The 500-game journal release test has a 30-second budget for full source validation and clustered scoring. Ordinary unit tests retain their five-second budget.

`npm run check` includes `check:tooling`. `tsconfig.tooling.json` checks script and test roots, including files no application module imports. Route tests that need generated SvelteKit types are included in the application config instead. An excluded tooling root is not permission to skip typechecking it.

Browser acceptance uses a pair of loopback ports. `POCKETCHECK_BROWSER_PORT` sets the browser server port, and the `npm start` launcher uses that port plus one. Every origin the tests send, including explicit `origin` headers, derives from it. When `npm run verify` or `npm run test:e2e` runs without the variable, it probes for a free pair starting at a random even offset above 42627, takes the first pair where both ports bind, and passes it to Playwright and its web server, so separate worktrees can verify at the same time. Running Playwright directly without the variable keeps 42627 and 42628. Set the variable to pin a pair, for example `POCKETCHECK_BROWSER_PORT=43100 npm run verify`. It is the only caller variable the runner passes through.

The browser server uses the built Node adapter on `http://127.0.0.1:<browser port>` (42627 by default) with `PROTOCOL_HEADER=x-forwarded-proto`. Browser requests send `x-forwarded-proto: http` so the adapter derives the correct origin. Acceptance covers a successful same-origin form submission and a mismatched-origin rejection. No development server is reused.

Acceptance also starts the documented `npm start` launcher (`scripts/start.ts`) on the browser port plus one (42628 by default) with the same fixture journal and outbound guard. Without `HOST` it must listen on `127.0.0.1` and accept a form posted from its own origin with no forwarded-protocol header, as a browser sends it. With `HOST=0.0.0.0` it must log the no-login warning and the allowed hosts, accept a form whose origin matches one of this machine's interface addresses in the `Host` header (loopback when the machine has no network interface), and reject a different origin with 403. A DNS-rebinding case sends `Host: rebind.attacker.example` with a matching `Origin`: both a GET and a form POST must get 421 with a plain-text body, while a name listed in `ALLOWED_HOSTS` is accepted. Unit tests in `tests/verification/listen.test.ts` cover the host check itself (loopback, interface addresses, `ALLOWED_HOSTS`, case, ports, IPv6 brackets, and a missing `Host`) and that dev and preview bind to `127.0.0.1`.

The verification runner passes a clean environment to each subprocess. Provider keys and database URLs are blank, including during build, so local `.env` values cannot fill them. The browser server requires `POCKETCHECK_TEST_MODE=fixture-browser`, a memory journal with a unique `browser-` identity, the fixed clock `2026-10-25T16:00:00.000Z`, and the checked-in schedule and injury fixtures. Weather is off. Its fetch guard rejects all outbound requests. A negative test invokes the real DeepSeek provider adapter and proves its request is stopped before transport.

The forecasting model is the checked-in fixture `tests/fixtures/models/browser-forecasting-model.json`. It is the unreleased artifact `npm run model:fit` produces from `tests/model/fixtures/synthetic-games.json`, trained through `2024-09-22T17:00:00Z`, and it is read from disk with no outbound request. Startup checks the configured path, the artifact's own checksum, the pinned checksum, the release status, and the training cutoff, and refuses anything else, including `off`. Because the artifact is unreleased, a research analysis still records its probabilities and frozen forecast but shows no value conclusion. To refit the fixture, rerun `npm run model:fit -- tests/model/fixtures/synthetic-games.json tests/fixtures/models/browser-forecasting-model.json`, format it, and update the pinned identity in `src/lib/server/verification.ts` and the browser tests. A change to training source also fails `tests/model/training-code.test.ts` until its training-code pins are updated.

Before each browser test, `/__verification` checks the effective SvelteKit environment, the fixture forecasting model's identity, and the selected drafter. The test compares the server's journal identity with this run's identity before any research submission. This endpoint returns 404 outside verification mode. Startup rejects unexpected fixture configuration before the server listens.

Browser scenarios import `test` from `tests/e2e/fixture.ts`. Its automatic fixture verifies the journal identity and resets the disposable journal before each independent scenario. Recovery steps keep their state within that scenario. No-JavaScript acceptance exercises native refresh and journal forms. Theme selection is checked immediately, before a reload. Entry-time checks run under UTC and America/New_York and reject nonexistent or unresolved ambiguous wall times.

Access tests use dummy secrets only. A separate protected production launcher must deny anonymous pages, data, exports, and mutations, then permit them through a signed session. It keeps the fixture-only verification route behind the same gate. Legacy unauthenticated LAN launcher scenarios explicitly set `POCKETCHECK_UNSAFE_LAN=1`. The verification environment blanks real access secrets, unsafe opt-ins, and release-attestation paths.

Use separate dependency directories for separate worktrees. SvelteKit writes generated environment types and route configuration under `node_modules/$app`. Sharing a `node_modules` symlink shares that mutable configuration between checkouts.

## Verify database storage

Create disposable PostgreSQL storage. Export its connection string explicitly, then run the database checks.

```sh
TEST_DATABASE_URL='postgresql://test_user:password@localhost/test_database?sslmode=disable' npm run verify:database
```

Use `sslmode=disable` only when the disposable server does not support TLS. Other connections require TLS. Integration tests never load `.env` and never use `DATABASE_URL` as a fallback. Missing `TEST_DATABASE_URL` fails the command.

The database command gives each test and hook 30 seconds instead of the unit default of 5. Every test migrates a fresh schema, and four files do that against one server at once, so the default limit fails on a quiet machine as migrations accumulate. Unit tests keep their 5-second limit.

Each test creates a random `it_` schema, applies every SQL migration there, and runs the shared storage contracts and journal recovery checks. Cleanup drops only the schema that test created, including after a migration failure. The public schema is untouched.

A schema normally has one connection, so its transactions run one after another. The completion concurrency tests open several connections to one schema and hold a table lock until two completions are both inside their transactions. That proves the game-row lock serializes them in PostgreSQL itself, not only in the memory journal.

CI's separate `database` job provisions a PostgreSQL 16 service with a disposable database, explicitly sets `TEST_DATABASE_URL`, and invokes `npm run verify:database`. Both jobs must pass before the change is considered verified. Repository maintainers must require both jobs in branch protection.

## Journal backup

The journal page downloads `/journal/export` as `pocketcheck-journal-v1.json`. Format version is `1`. Version 1 is the only backup restore accepts.

The file contains games, offers, evidence used by analyses, analysis identifiers, original timestamps, parent links, immutable snapshots, gaps, manual coverage, and policy results. It also contains actual-bet contracts and stakes, primary classifications, closing observations, settlement and correction history, frozen forecasts, and provider attempt accounting. Game boards, with their anchor pairs, extra sportsbook quotes, and model picks, are optional lists on the same version 1 file. A board market saved before its anchor pair was recorded restores without one. A backup from before boards still restores. Settlement history includes notices for a bet placed from a model pick, which name the bet and no analysis. Failed, interrupted, and ambiguous attempts stay in the file with their durable responses.

Legacy records keep their saved provenance limits. Export does not fill in facts the record does not have.

New `forecast-first-v1` boards complete their calculations and primary classifications before explanation. Their raw board records remain immutable. Optional `explanationEvents` preserve separate attempts, exclusive original and repair reservations, request-body hashes, durable response accounting, and terminal outcomes. Public reads compose that history for display. Export writes raw boards and the event list separately. A legacy board without this lifecycle keeps its saved inline explanation history. Missing event lists default to empty only when the remaining graph is valid. Restore never resumes provider work.

The memory journal used by browser acceptance stores the same version 1 records as the Neon journal, with storage identifiers fixed when each record is made. Both journals export the same lists in the same order, so a file moves from memory to Neon and back, or from Neon to memory and back, unchanged. `tests/journal-backup-contract.ts` runs that round trip in both directions, along with idempotent, rejected, legacy, and no-request restores. `src/lib/server/analysis/journal-backup.ts` owns decoding.

Restore also reads two older layouts. A version 1 file written before boards or later lists restores with each missing list empty and each missing later field null. A memory backup written before the memory journal stored version 1 records (private `runs`, `actualBets`, `closingObservations`, and `notices` lists) is converted first. Rows that layout never had, such as an analysis's offer row, get name-based identifiers derived from the record they belong to. Those identifiers are storage identity only. A memory record that version 1 cannot hold without inventing a fact is rejected with its identifier: a report without a completion time, rendered text without its report, and a model-pick bet without its placed contract. A file whose memory lists and version 1 lists disagree is rejected. Export never writes the memory layout.

The file does not contain provider credentials, credential-bearing request headers, application settings, bulk source caches, or model training datasets. Forecast identity and the recorded inputs needed to recover a forecast stay in the snapshot. Export writes only the journal record lists, so settings and credentials have no place in the file. Saved records are immutable, so export does not edit them. If a record holds a configured credential, a value shaped like a provider key or database URL, or a credential-named header, no file is written and the error names each record path.

Restore checks the version, record shapes, identifiers, relationships, snapshots, and event histories before it writes. A list or field this version does not know, including a newer board format, is rejected rather than dropped. A valid file is applied atomically: Neon restores in one transaction, registrations and games first and every record after the records it references, and memory merges into copies before replacing its records. Restoring the same file again keeps one copy of each identical record. A malformed record, a missing relationship, an unsupported version, or a conflicting identifier is rejected and leaves the destination unchanged. Conflicting identifiers are not replaced.

A restored pending or ambiguous attempt stays readable. Restore does not call a source or a provider and does not replay that work.

The Neon journal reads every collection, boards included, inside one read-only snapshot, and the whole graph is validated before any byte is written. `node --experimental-strip-types scripts/journal/export.ts <file>` writes the same file as the download. It uses the application's TLS connection settings and refuses to replace an existing file.

Reachable recovery is the journal page form, which posts a version 1 file to `?/restore`. The download itself does not write.

## Keep live experiments separate

Automated acceptance uses the deterministic fixture drafter. To experiment with a live provider, use the normal application and its Settings page with your own credentials and journal. Such requests can incur provider charges. A live result does not replace isolated verification or establish model eligibility.

## Evaluate prospective forecasts

Register an artifact before collecting its qualifying forecasts. The journal records the registration time and the frozen protocol. Record a later two-sided closing market snapshot for each comparison. Export the journal and copy its registration record into `protocol.json`. This file is checked against the exported registration and cannot establish registration independently.

```sh
npm run model:prospective -- journal-v1.json protocol.json prospective-report.json
```

The report lists excluded records and scores qualified saved forecasts. The close baseline removes the margin from the two closing prices and uses the forecast's frozen push probability. The closing prices alone do not estimate push probability.

To test a release decision, supply the original artifact and the same export. The command recomputes the decision and writes a separate immutable attestation only when the frozen protocol passes. It leaves the predictor bytes and checksum unchanged and refuses to replace an existing file.

```sh
npm run model:release -- artifact.json journal-v1.json protocol.json release-attestation.json
```

Historical holdout reports and edited prospective report verdicts cannot release a market. A synthetic test result does not establish eligibility for a real market. Existing forecasts without proven registration remain readable and do not qualify.

Runtime verification reconstructs the qualified sample from the attestation's complete evidence bundle and recomputes the frozen gate. Raw historical release flags and a matching content hash alone cannot authorize eligibility. Future forecasts retain the verified attestation checksum separately from predictor identity. New model semantics require a new fitted artifact and registration. Automated refitting is limited to the explicitly named synthetic browser fixture, never the production predictor.
