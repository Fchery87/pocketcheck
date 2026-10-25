<script lang="ts">
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

<main>
  <h1>Settings</h1>
  <p>
    API keys stay in server environment variables. This page shows only whether each key is set,
    and stores only your choices and the model catalogs.
  </p>
  {#if form?.error}
    <p data-testid="form-error">{form.error}</p>
  {:else if form && "refreshed" in form}
    <p data-testid="form-success">{form.refreshed} catalog refreshed.</p>
  {:else if form && "tested" in form}
    <p data-testid="form-success">{form.tested}.</p>
  {:else if form && "chosen" in form}
    <p data-testid="form-success">Drafter saved.</p>
  {/if}

  <section>
    <h2>Thesis drafter</h2>
    <form method="POST" action="?/choose">
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
      <button type="submit" data-testid="choose-drafter">Use this drafter</button>
    </form>
    <p data-testid="current-drafter">Current: {current}</p>
    <p>
      There is no automatic fallback. If the chosen model is removed or its key is missing, analysis
      stops and says why.
    </p>
  </section>

  {#each data.providers as provider (provider.id)}
    <section data-testid="provider-{provider.id}">
      <h2>{provider.label}</h2>
      <p>Base URL {provider.baseUrl}</p>
      <p data-testid="key-status-{provider.id}">
        {provider.keyName}: {provider.keyConfigured ? "set" : "not set"}
      </p>
      <form method="POST" action="?/refresh">
        <input type="hidden" name="provider" value={provider.id} />
        <button type="submit" disabled={!provider.keyConfigured}>Refresh catalog</button>
      </form>
      {#if provider.retrievedAt}
        <p data-testid="catalog-status-{provider.id}">
          {provider.entries.length} models, retrieved {provider.retrievedAt}
        </p>
        {#if provider.preferredId}
          <p>Suggested: {provider.preferredId}</p>
        {/if}
        <table>
          <thead>
            <tr><th>Model</th><th>Capability</th><th>Notes</th><th></th></tr>
          </thead>
          <tbody>
            {#each provider.entries as entry (entry.id)}
              <tr>
                <td>{entry.id}</td>
                <td>{entry.capability}</td>
                <td>
                  {entry.reason ?? ""}
                  {#if entry.testedAt}(tested {entry.testedAt}){/if}
                </td>
                <td>
                  {#if entry.capability === "untested" && provider.keyConfigured}
                    <form method="POST" action="?/test">
                      <input type="hidden" name="provider" value={provider.id} />
                      <input type="hidden" name="modelId" value={entry.id} />
                      <button type="submit">Test (one small request)</button>
                    </form>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p data-testid="catalog-status-{provider.id}">Catalog not loaded. No request has been made.</p>
      {/if}
    </section>
  {/each}
</main>
