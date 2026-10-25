<script lang="ts">
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
</script>

<main>
  <h1>Journal</h1>
  <h2>Assessments</h2>
  <ul data-testid="assessments">
    {#each data.assessments as assessment (assessment.id)}
      <li>
        <a href="/analysis/{assessment.id}">{assessment.conclusion}</a>
        <span>{assessment.away} at {assessment.home}</span>
        <span>American odds {assessment.americanOdds}</span>
      </li>
    {/each}
  </ul>

  <h2>Record an actual bet</h2>
  <form method="POST">
    <label>
      Analysis
      <select name="analysisId">
        <option value="">none</option>
        {#each data.assessments as assessment (assessment.id)}
          <option value={assessment.id}>{assessment.conclusion}</option>
        {/each}
      </select>
    </label>
    <label>
      Sportsbook
      <input name="sportsbook" required />
    </label>
    <label>
      American odds
      <input name="americanOdds" required />
    </label>
    <label>
      Stake units
      <input name="stakeUnits" required />
    </label>
    <button type="submit">Record bet</button>
  </form>
  {#if form?.recorded}
    <p data-testid="bet-recorded">Bet recorded</p>
  {/if}
  <ul data-testid="bets">
    {#each data.bets as bet (bet.id)}
      <li>{bet.sportsbook} {bet.americanOdds} for {bet.stakeUnits} units</li>
    {/each}
  </ul>
</main>
