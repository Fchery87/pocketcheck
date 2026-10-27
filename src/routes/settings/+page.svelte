<script lang="ts">
  import { Alert } from "#lib/components/ui/alert/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import * as Table from "#lib/components/ui/table/index.ts";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const current = $derived(
    data.drafter.provider === "fixture" ? "fixture" : `${data.drafter.provider}:${data.drafter.modelId}`,
  );
  const usable = $derived(
    data.providers.flatMap((provider) =>
      provider.entries
        .filter((entry) => entry.compatible)
        .map((entry) => ({ value: `${provider.id}:${entry.id}`, label: `${provider.label}: ${entry.id}` })),
    ),
  );
</script>

<main class="pc-page pc-settings">
  <h1>Settings</h1>
  <p class="pc-hint">
    API keys stay in server environment variables. This page shows only whether each key is set,
    and stores only your choices and the model catalogs.
  </p>
  {#if form?.error}
    <Alert data-testid="form-error">{form.error}</Alert>
  {:else if form && "refreshed" in form}
    <p class="pc-success" data-testid="form-success">{form.refreshed} catalog refreshed.</p>
  {:else if form && "tested" in form}
    <p class="pc-success" data-testid="form-success">{form.tested}.</p>
  {:else if form && "chosen" in form}
    <p class="pc-success" data-testid="form-success">Drafter saved.</p>
  {/if}

  <section class="pc-section">
    <h2>Thesis drafter</h2>
    <form class="pc-choices" method="POST" action="?/choose">
      <label>
        <input type="radio" name="drafter" value="fixture" checked={current === "fixture"} />
        Fixture drafter (no AI call; restates the policy and cites the schedule)
      </label>
      {#each usable as option (option.value)}
        <label>
          <input type="radio" name="drafter" value={option.value} checked={current === option.value} />
          {option.label}
        </label>
      {/each}
      <Button type="submit" data-testid="choose-drafter">Use this drafter</Button>
    </form>
    <p data-testid="current-drafter">Current: {current}</p>
    <p>
      There is no automatic fallback. If the chosen model is removed or its key is missing, analysis
      stops and says why.
    </p>
  </section>

  {#each data.providers as provider (provider.id)}
    <section class="pc-section" data-testid="provider-{provider.id}">
      <h2>{provider.label}</h2>
      <p class="pc-figure pc-hint">Base URL {provider.baseUrl}</p>
      <p data-testid="key-status-{provider.id}">
        {provider.keyName}: {provider.keyConfigured ? "set" : "not set"}
      </p>
      <form method="POST" action="?/refresh">
        <input type="hidden" name="provider" value={provider.id} />
        <Button type="submit" disabled={!provider.keyConfigured}>Refresh catalog</Button>
      </form>
      {#if provider.retrievedAt}
        <p data-testid="catalog-status-{provider.id}">
          {provider.entries.length} models, retrieved {provider.retrievedAt}
        </p>
        {#if provider.preferredId}
          <p>Suggested: {provider.preferredId}</p>
        {/if}
        <Table.Root>
          <Table.Header>
            <Table.Row><Table.Head>Model</Table.Head><Table.Head>Capability</Table.Head><Table.Head>Notes</Table.Head><Table.Head><span class="sr-only">Action</span></Table.Head></Table.Row>
          </Table.Header>
          <Table.Body>
            {#each provider.entries as entry (entry.id)}
              <Table.Row>
                <Table.Cell class="font-mono text-sm">{entry.id}</Table.Cell>
                <Table.Cell>{entry.capability}</Table.Cell>
                <Table.Cell>
                  {entry.reason ?? ""}
                  {#if entry.testedAt}(tested {entry.testedAt}){/if}
                </Table.Cell>
                <Table.Cell>
                  {#if entry.capability === "untested" && provider.keyConfigured}
                    <form method="POST" action="?/test">
                      <input type="hidden" name="provider" value={provider.id} />
                      <input type="hidden" name="modelId" value={entry.id} />
                      <Button type="submit">Test (one small request)</Button>
                    </form>
                  {/if}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      {:else}
        <p data-testid="catalog-status-{provider.id}">Catalog not loaded. No request has been made.</p>
      {/if}
    </section>
  {/each}
</main>
