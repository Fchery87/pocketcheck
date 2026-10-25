<script lang="ts">
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  let refreshOdds = $state("");
  $effect(() => {
    refreshOdds = String(data.americanOdds);
  });
</script>

<main>
  <h1>Report</h1>
  <p data-testid="status">{data.status}</p>
  <ol data-testid="progress">
    {#each data.stages as stage (stage)}
      <li>{stage}</li>
    {/each}
  </ol>
  {#if data.report}
    <p data-testid="conclusion">{data.report.conclusion}</p>
    <p data-testid="summary">{data.report.summary}</p>
    <p data-testid="price">American odds {data.americanOdds}</p>
    <ul data-testid="citations">
      {#each data.citations as citation (citation)}
        <li>{citation}</li>
      {/each}
    </ul>
    <ul data-testid="missing-evidence">
      {#each data.report.missingInputs as gap (gap)}
        <li>{gap}</li>
      {/each}
    </ul>
    {#if data.lean}
      <section data-testid="user-lean">
        <h2>Your lean</h2>
        <p>{data.lean.text}</p>
        {#if data.lean.rationale}
          <p>{data.lean.rationale}</p>
        {/if}
      </section>
    {/if}
    <form method="POST" action="?/refresh">
      <input type="hidden" name="gameId" value={data.gameId} />
      <input type="hidden" name="sportsbook" value={data.sportsbook} />
      <input type="hidden" name="market" value={data.market} />
      <input type="hidden" name="selection" value={data.selection} />
      <input type="hidden" name="observedAt" value={data.observedAt} />
      <input type="hidden" name="tieRule" value={data.tieRule ?? "push"} />
      <input type="hidden" name="parentId" value={data.id} />
      <input type="hidden" name="lean" value={data.lean?.text ?? ""} />
      <input type="hidden" name="rationale" value={data.lean?.rationale ?? ""} />
      <label>
        American odds
        <input name="americanOdds" bind:value={refreshOdds} data-testid="refresh-odds" />
      </label>
      <button type="submit" data-testid="refresh">Refresh</button>
    </form>
  {:else}
    <p data-testid="failure">{data.failureReason}</p>
  {/if}
</main>
