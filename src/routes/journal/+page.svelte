<script lang="ts">
  import { easternTime, signedLine } from "#lib/format.ts";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const label = (assessment: (typeof data.assessments)[number]) =>
    `${assessment.game.away} at ${assessment.game.home}: ${assessment.offer.market} ${assessment.offer.selection} ${signedLine(assessment.offer.pointLine)} ${assessment.offer.americanOdds}`;
</script>

<main>
  <h1>Journal</h1>
  <h2>Assessments</h2>
  <p>Every completed assessment is listed, including passes. Refreshes are listed separately from their originals.</p>
  <ul data-testid="assessments">
    {#each data.assessments as assessment (assessment.id)}
      <li>
        <a href="/analysis/{assessment.id}">{assessment.conclusion}</a>
        <span>{label(assessment)}</span>
        <span>at {assessment.offer.sportsbook}, analyzed {easternTime(assessment.createdAt)}</span>
        {#if assessment.parentId}<span>(refresh)</span>{/if}
      </li>
    {/each}
  </ul>

  <h2>Record an actual bet</h2>
  <p>A bet is your decision. It is stored apart from the system's assessment.</p>
  <form method="POST">
    <label>
      Analysis
      <select name="analysisId" required data-testid="bet-analysis">
        <option value="">choose an analysis</option>
        {#each data.assessments as assessment (assessment.id)}
          <option value={assessment.id}>{label(assessment)}</option>
        {/each}
      </select>
    </label>
    <label>
      Sportsbook
      <input name="sportsbook" required />
    </label>
    <label>
      American odds you got
      <input name="americanOdds" required />
    </label>
    <label>
      Stake units
      <input name="stakeUnits" required inputmode="decimal" />
    </label>
    <button type="submit">Record bet</button>
  </form>
  {#if form?.recorded}
    <p data-testid="bet-recorded">Bet recorded</p>
  {:else if form?.error}
    <p data-testid="form-error">{form.error}</p>
  {/if}
  <ul data-testid="bets">
    {#each data.bets as bet (bet.id)}
      <li>
        <a href="/analysis/{bet.analysisId}">{bet.sportsbook} {bet.americanOdds} for {bet.stakeUnits} units</a>,
        placed {easternTime(bet.placedAt)}
      </li>
    {/each}
  </ul>
</main>
