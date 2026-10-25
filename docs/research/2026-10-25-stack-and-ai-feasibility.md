# PocketCheck stack and AI feasibility

Reviewed: 2026-10-25. This is a documentation audit, not a successful integration test. No credentials were requested, authenticated calls made, packages installed, or databases provisioned.

## Conclusion

The requested stack is a reasonable candidate for a local personal application. Keep a single SvelteKit server, a small Neon database, local research artifacts, and two explicitly configured AI providers. Prove the selected SvelteKit/Vite+ combination with a small build before writing the application. Model discovery and account access remain runtime checks.

## Framework and toolchain

SvelteKit builds on Svelte and Vite. Its framework supplies routing and server rendering; Vite+ is the development toolchain rather than an additional application framework. [SvelteKit introduction](https://svelte.dev/docs/kit/introduction)

Vite+ documents project creation, migration, linting, testing, and building through its CLI. Its public repository carries an MIT license. The creation guide recognizes a `svelte` shorthand, but that alone does not establish the exact generated application's suitability for this project. Inspect generated files and CLI help rather than assume the template is the desired SvelteKit setup. [Vite+ guide](https://viteplus.dev/guide/), [creation guide](https://viteplus.dev/guide/create), [license](https://github.com/voidzero-dev/vite-plus/blob/main/LICENSE)

The current test guide identifies a bundled Vitest version and specific Node requirements. Recheck and pin compatible versions at implementation time. Proposed baseline: an eligible Node 24 LTS release, npm with a lockfile, SvelteKit, TypeScript, Vite+, `svelte-check`, and Playwright. Run a route, a server action, a test, Svelte checking, and a production build before committing to this combination. Do not infer that a fast general JavaScript check validates Svelte templates. [Vite+ testing](https://viteplus.dev/guide/test)

SvelteKit's Node adapter is the intended local production runtime. Server-only modules provide a framework boundary for private integrations. Proposed implementation: bind to `127.0.0.1`, keep provider keys in private environment variables, and expose neither keys nor raw provider errors to the browser. [Node adapter](https://svelte.dev/docs/kit/adapter-node), [server-only modules](https://svelte.dev/docs/kit/server-only-modules)

## Neon and the zero-additional-cost constraint

Neon's Free plan has finite storage, compute, and transfer allowances. The pricing documentation says exhausted allowances can suspend compute or block writes; the Free plan is not an unlimited archive. Current quoted limits include 1 GB of Postgres storage per project and 100 CU-hours per project; verify these in the user's actual organization before setup. [Neon pricing](https://neon.com/pricing)

Design proposal: store normalized game inputs, evidence metadata, selected excerpts, reports, model outputs, and results in Neon. Keep large public play-by-play downloads and reproducible training artifacts in an ignored local `data/` directory. Keep the Neon organization on Free, avoid continuous polling, export journal records locally, and show storage failures explicitly. Do not automatically upgrade, spread one workload across projects to evade limits, or promise uninterrupted service.

The existing AI allowance is separate from free sports data. An API key proves neither remaining balance nor included inference/search usage. Do not assert a zero-dollar total bill. Provider-side account limits are the authoritative spending control; local token estimates are informational.

## TheClawBay

The provider documents `https://api.theclawbay.com/v1`, bearer authentication, `GET /models`, and completion endpoints. It says the account's model catalog can vary. Its published catalog lists `grok-4.7`; actual access has not been tested. [Provider documentation](https://theclawbay.com/docs), [published catalog](https://theclawbay.com/models)

Design proposal: default to `grok-4.7` when returned by that account's catalog. List every returned model in Settings, but identify non-text or otherwise incompatible entries and disable their use for thesis generation with a reason. Discovery is not proof that a model supports structured output, tools, or the same protocol as another model. Keep a provider/model capability record with states declared, tested, unknown, and unavailable. Cache the catalog with a last-refreshed time, permit manual refresh, and retain saved reports if a model disappears. Never silently switch to a different provider or chargeable model.

## Direct DeepSeek

DeepSeek documents its direct base URL as `https://api.deepseek.com` and a `GET /models` discovery endpoint. Current documentation includes model aliases; avoid fixing a permanent list from today's examples. The direct account and TheClawBay's DeepSeek offerings are distinct connections. [First API call](https://api-docs.deepseek.com/), [model listing](https://api-docs.deepseek.com/api/list-models/)

The tool-calling guide requires the application to execute requested external functions. A tool call does not give the model independent internet access. [Tool calls](https://api-docs.deepseek.com/guides/tool_calls)

Design proposal: use one small provider adapter contract for discovery and thesis generation, backed by provider-specific request/response parsing. Start with text completion over the protocol proven for each selected model. Validate responses against the application's report schema whether or not native structured output is available. Do not add a large agent framework just to send evidence and receive a thesis.

## Research retrieval is a separate dependency

The application needs source adapters to obtain current information. Sending a team name to a model cannot establish that it fetched today's injuries or weather. Start with direct public datasets, official reports, and explicitly entered source material. General web search and provider-hosted search are optional, separately verified capabilities with their own billing and access conditions.

For each research fact, retain its source, publication or effective time where known, retrieval time, and the supporting data or permitted excerpt. Evidence text is untrusted input: it cannot change application policy, request credentials, or authorize tool execution. Source citations must reference evidence supplied to that report, not links invented by the model. Citation existence is necessary but human review is still needed to assess whether the source supports the claim.

## Checks deferred to implementation

1. Pin and smoke-test the actual SvelteKit/Vite+ versions on the installed Node runtime.
2. Verify the user's Neon project belongs to a Free organization and exercise a disposable development database.
3. Configure keys locally; verify model discovery without logging secrets.
4. Run an explicitly initiated, minimal thesis request for the selected model; record usage and capability results.
5. Verify current data endpoints and schema fixtures from the NFL source audit.
6. Confirm that any search feature is available through the configured provider and existing allowance before enabling it.

These are concrete implementation acceptance checks, not reasons to promise functionality that has not been tested.
