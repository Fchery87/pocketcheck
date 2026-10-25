<script lang="ts">
  import { easternTime, percent, signedLine } from "#lib/format.ts";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const run = $derived(data.run);
  const report = $derived(data.run.report);
  const fixture = $derived(run.provider === "fixture");
</script>

<main>
  <h1>Report: {run.game.away} at {run.game.home}</h1>
  <p>{easternTime(run.game.kickoff)}, {run.game.venue}</p>
  <p data-testid="status">{run.status}</p>
  {#if run.parentId}
    <p>Refresh of <a href="/analysis/{run.parentId}">an earlier report</a>. That report is unchanged.</p>
  {/if}
  {#if form?.error}
    <p data-testid="form-error">{form.error}</p>
  {/if}

  <section data-testid="offer">
    <h2>Offer</h2>
    <p>
      {run.offer.sportsbook}: {run.offer.market}, {run.offer.selection}
      {signedLine(run.offer.pointLine)}
    </p>
    <p data-testid="price">American odds {run.offer.americanOdds}</p>
    <p>Decimal odds <span data-testid="decimal-odds">{data.decimalOdds.toFixed(4)}</span></p>
    <p>
      Break-even win probability, excluding pushes
      <span data-testid="break-even">{percent(data.decisiveBreakEven)}</span>
    </p>
    <p data-testid="observed-at-display">Price observed {easternTime(run.offer.observedAt)}</p>
    <p>Analyzed {easternTime(run.cutoffAt)}. Evidence after that time was excluded.</p>
    {#if run.offer.rules.tie}
      <p>Tie rule: {run.offer.rules.tie}. Overtime included.</p>
    {/if}
  </section>

  {#if run.policy}
    <section data-testid="policy">
      <h2>Conclusion</h2>
      <p data-testid="conclusion">{run.policy.conclusion}</p>
      {#if run.policy.blockingReason}
        <p>{run.policy.blockingReason}</p>
      {/if}
      <p>
        Expected value {run.policy.expectedValuePerUnit === null
          ? "unavailable"
          : `${run.policy.expectedValuePerUnit.toFixed(4)} units per unit staked`}
      </p>
      <p>{run.policy.label}</p>
      <p>Policy {run.policy.policyVersion}</p>
    </section>
  {/if}

  {#if report}
    <section>
      <h2>Thesis</h2>
      <p data-testid="drafter">
        Drafted by {run.model}{fixture ? " (fixture drafter, no AI call)" : ` via ${run.provider}`}
      </p>
      <p data-testid="summary">{report.summary}</p>
      <ul data-testid="claims">
        {#each data.claims as claim, index (index)}
          <li>
            <strong>{claim.stance}</strong>: {claim.text}
            <span>[{claim.evidenceIds.join(", ")}]</span>
          </li>
        {/each}
      </ul>
    </section>

    <section>
      <h2>Cited evidence</h2>
      <ul data-testid="citations">
        {#each data.citations as item (item.id)}
          <li>
            <code>{item.id}</code>
            {#if "missing" in item}
              Evidence was not saved with this run.
            {:else}
              {item.excerpt ?? JSON.stringify(item.facts)}
              ({item.sourceId}, {item.origin}, retrieved {easternTime(item.retrievedAt)}, published
              {item.publishedAt === "unknown" ? "unknown" : easternTime(item.publishedAt)})
              {#if item.url && /^https?:\/\//i.test(item.url)}<a href={item.url} rel="noreferrer">source</a>{/if}
            {/if}
          </li>
        {/each}
      </ul>
    </section>

    <section>
      <h2>Missing inputs</h2>
      <ul data-testid="missing-evidence">
        {#each report.missingInputs as gap (gap)}
          <li>{gap}</li>
        {/each}
      </ul>
      <h2>Assumptions</h2>
      <ul data-testid="assumptions">
        {#each report.assumptions as assumption (assumption)}
          <li>{assumption}</li>
        {/each}
      </ul>
      <h2>Uncertainty</h2>
      <p data-testid="uncertainty">{report.uncertainty}</p>
      <h2>What would change this conclusion</h2>
      <ul data-testid="change-conditions">
        {#each report.changeConditions as condition (condition)}
          <li>{condition}</li>
        {/each}
      </ul>
    </section>
  {:else}
    <section>
      <h2>Drafting failed</h2>
      <p data-testid="failure">{run.failureReason}</p>
      <p>The evidence and price mathematics below are kept.</p>
      <ul data-testid="citations">
        {#each run.evidence as item (item.id)}
          <li><code>{item.id}</code> {item.excerpt ?? JSON.stringify(item.facts)} ({item.sourceId})</li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if run.lean}
    <section data-testid="user-lean">
      <h2>Your lean, recorded before this report</h2>
      <p>{run.lean.text}</p>
      {#if run.lean.rationale}
        <p>{run.lean.rationale}</p>
      {/if}
    </section>
  {/if}

  <ol data-testid="progress">
    {#each run.stages as stage (stage)}
      <li>{stage}</li>
    {/each}
  </ol>

  <form method="POST" action="?/refresh">
    <h2>Refresh at a new price</h2>
    <input type="hidden" name="sportsbook" value={run.offer.sportsbook} />
    <label>
      American odds
      <input name="americanOdds" value={run.offer.americanOdds} required data-testid="refresh-odds" />
    </label>
    <label>
      When you saw the new price
      <input
        type="datetime-local"
        name="observedAt"
        value={data.refreshObservedDefault}
        required
        data-testid="refresh-observed-at"
      />
    </label>
    <button type="submit" data-testid="refresh">Refresh</button>
  </form>
</main>
