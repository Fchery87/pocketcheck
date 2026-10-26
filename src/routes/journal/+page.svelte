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
        {#if assessment.reliesOnManualEvidence}<span>(relies on manual evidence)</span>{/if}
        {#if assessment.snapshotProvenance === "legacy-unknown"}
          <span data-testid="legacy-snapshot-provenance">
            (original game details could not be confirmed)
          </span>
        {/if}
      </li>
    {/each}
  </ul>

  <h2>Record an actual bet</h2>
  <p>
    Record the contract you placed. It can differ from the researched offer, and saving it does not
    change that research.
  </p>
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
      Submission identifier
      <input name="submissionId" required data-testid="bet-submission" />
    </label>
    <label>
      Sportsbook you used
      <input name="sportsbook" required />
    </label>
    <label>
      Market you placed
      <select name="market" data-testid="bet-market">
        <option value="moneyline">moneyline</option>
        <option value="spread">spread</option>
        <option value="total">total</option>
      </select>
    </label>
    <label>
      Selection you placed
      <select name="selection" data-testid="bet-selection">
        <option value="home">home</option>
        <option value="away">away</option>
        <option value="over">over</option>
        <option value="under">under</option>
      </select>
    </label>
    <label>
      Line you placed (selected side, spread or total)
      <input name="pointLine" inputmode="decimal" data-testid="bet-line" />
    </label>
    <label>
      Tie rule (moneyline)
      <select name="tie" data-testid="bet-tie">
        <option value="">not a moneyline</option>
        <option value="push">push</option>
        <option value="loss">loss</option>
        <option value="win">win</option>
        <option value="void">void</option>
      </select>
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
        {#if bet.contractProvenance === "captured"}
          <a href="/analysis/{bet.analysisId}" data-testid="bet-contract">
            {bet.sportsbook} {bet.market} {bet.selection} {signedLine(bet.pointLine)} {bet.americanOdds}
            for {bet.stakeUnits} units, placed {easternTime(bet.placedAt)}, full game, overtime included
            {#if bet.rules?.tie}, tie {bet.rules.tie}{/if}
          </a>
        {:else}
          <a href="/analysis/{bet.analysisId}">
            {bet.sportsbook} {bet.americanOdds} for {bet.stakeUnits} units
          </a>
          <span data-testid="legacy-bet-provenance">
            placed {easternTime(bet.placedAt)}. The market, line, and rules of this placement were not recorded.
          </span>
        {/if}
      </li>
    {/each}
  </ul>
</main>
