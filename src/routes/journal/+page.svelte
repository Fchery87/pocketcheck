<script lang="ts">
  import { Alert } from "#lib/components/ui/alert/index.ts";
  import { Badge } from "#lib/components/ui/badge/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { easternTime, signedLine } from "#lib/format.ts";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const label = (assessment: (typeof data.assessments)[number]) =>
    `${assessment.game.away} at ${assessment.game.home}: ${assessment.offer.market} ${assessment.offer.selection} ${signedLine(assessment.offer.pointLine)} ${assessment.offer.americanOdds}`;
</script>

<main class="pc-page pc-journal">
  <h1>Journal</h1>
  <p class="pc-hint">
    <Button href="/journal/export" data-testid="journal-export" download="pocketcheck-journal-v1.json">
      Download journal backup
    </Button>
    Version 1 includes research, bets, attempts, and outcomes. It omits credentials and bulk source caches.
    Restoring version 1 checks the whole file first. A damaged or conflicting backup changes nothing.
  </p>
  <form class="pc-form" method="POST" action="?/restore" enctype="multipart/form-data" data-testid="restore-form">
    <label>
      Restore a version 1 backup
      <input name="backup" type="file" accept="application/json" required data-testid="restore-file" />
    </label>
    <Button type="submit">Restore journal</Button>
  </form>
  {#if form?.restored}
    <p class="pc-success" data-testid="restore-recorded">Journal restored. Pending attempts stay readable and are not replayed.</p>
  {:else if form?.error && form?.restored === false}
    <Alert data-testid="form-error">{form.error}</Alert>
  {/if}
  <h2>Assessments</h2>
  <p>Every completed assessment is listed, including passes. Refreshes are listed separately from their originals.</p>
  <ul class="pc-ledger pc-entries" data-testid="assessments">
    {#each data.assessments as assessment (assessment.id)}
      <li>
        <a class="pc-entry-verdict" href="/analysis/{assessment.id}">{assessment.conclusion}</a>
        <span class="pc-figure">{label(assessment)}</span>
        <span>at {assessment.offer.sportsbook}, analyzed {easternTime(assessment.createdAt)}</span>
        {#if assessment.assessmentRole.role === "primary"}
          <Badge data-testid="assessment-role">primary: {assessment.assessmentRole.reason}</Badge>
        {:else if assessment.assessmentRole.role === "refresh"}
          <Badge data-testid="assessment-role">refresh: {assessment.assessmentRole.reason}</Badge>
        {:else if assessment.assessmentRole.role === "ineligible"}
          <Badge data-testid="assessment-role">ineligible: {assessment.assessmentRole.reason}</Badge>
        {:else}
          <Badge data-testid="assessment-role">unclassified: {assessment.assessmentRole.reason}</Badge>
        {/if}
        {#if assessment.reliesOnManualEvidence}<span>(relies on manual evidence)</span>{/if}
        {#if assessment.snapshotProvenance === "legacy-unknown"}
          <Badge variant="dashed" data-testid="legacy-snapshot-provenance">
            (original game details could not be confirmed)
          </Badge>
        {/if}
      </li>
    {/each}
  </ul>

  <h2>Performance</h2>
  <p class="pc-hint">
    System assessments and actual bets are separate. A refresh stays in the history and is not another
    independent assessment. Return uses only wins and losses. Push, void, unresolved, and missing closing
    observations are not zero.
  </p>
  <div class="pc-split">
  <section class="pc-section pc-summary" data-testid="assessment-summary">
    <h3>Frozen primary assessments</h3>
    <p data-testid="assessment-counts">
      {data.performance.assessments.counts.primary} primary,
      {data.performance.assessments.counts.refresh} refresh,
      {data.performance.assessments.counts.settled} settled,
      {data.performance.assessments.counts.unresolved} unresolved,
      {data.performance.assessments.counts.push} push,
      {data.performance.assessments.counts.void} void,
      {data.performance.assessments.counts.missingClosing} missing closing
    </p>
    <p data-testid="assessment-denominators">
      Return denominator {data.performance.assessments.denominators.returnOnSettledStakes} settled units.
      Closing comparisons {data.performance.assessments.denominators.closingComparisons}.
    </p>
    <p data-testid="assessment-roi">
      {#if data.performance.assessments.roi.available}
        Return {data.performance.assessments.roi.roi}
      {:else}
        Return unavailable
      {/if}
    </p>
  </section>
  <section class="pc-section pc-summary" data-testid="bet-summary">
    <h3>Actual bets</h3>
    <p data-testid="bet-counts">
      {data.performance.bets.counts.bets} bets,
      {data.performance.bets.counts.settled} settled,
      {data.performance.bets.counts.unresolved} unresolved,
      {data.performance.bets.counts.push} push,
      {data.performance.bets.counts.void} void,
      {data.performance.bets.counts.missingClosing} missing closing
    </p>
    <p data-testid="bet-denominators">
      Return denominator {data.performance.bets.denominators.returnOnSettledStakes} settled stake units.
      Closing comparisons {data.performance.bets.denominators.closingComparisons}.
    </p>
    <p data-testid="bet-roi">
      {#if data.performance.bets.roi.available}
        Return {data.performance.bets.roi.roi}
      {:else}
        Return unavailable
      {/if}
    </p>
  </section>
  </div>

  <h2>Record an actual bet</h2>
  <p class="pc-hint">
    Record the contract you placed. It can differ from the researched offer, and saving it does not
    change that research.
  </p>
  <form class="pc-form" method="POST" action="?/bet" data-testid="bet-form">
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
    <Button type="submit">Record bet</Button>
  </form>
  {#if form?.recorded && !form?.closingId}
    <p class="pc-success" data-testid="bet-recorded">Bet recorded</p>
  {:else if form?.error && !form?.closingId}
    <Alert data-testid="form-error">{form.error}</Alert>
  {/if}
  <ul class="pc-ledger" data-testid="bets">
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
          <Badge variant="dashed" data-testid="legacy-bet-provenance">
            placed {easternTime(bet.placedAt)}. The market, line, and rules of this placement were not recorded.
          </Badge>
        {/if}
      </li>
    {/each}
  </ul>
  <h2>Settlement</h2>
  <p class="pc-hint">
    Record a final score, postponement, void, or unresolved notice. The research offer and each actual
    bet are graded from their own contracts. A repeated event is ignored. A correction keeps the earlier
    notice and needs a reason.
  </p>
  <form class="pc-form" method="POST" action="?/settle">
    <label>
      Analysis
      <select name="analysisId" required data-testid="settle-analysis">
        <option value="">choose an analysis</option>
        {#each data.assessments as assessment (assessment.id)}
          <option value={assessment.id}>{label(assessment)}</option>
        {/each}
      </select>
    </label>
    <label>
      Actual bet (optional, for the record reference)
      <select name="betId" data-testid="settle-bet">
        <option value="">research assessment only</option>
        {#each data.bets as bet (bet.id)}
          <option value={bet.id}>{bet.sportsbook} {bet.market} {signedLine(bet.pointLine)}</option>
        {/each}
      </select>
    </label>
    <label>
      Event identifier
      <input name="eventId" required data-testid="settle-event" />
    </label>
    <label>
      Kind
      <select name="kind" data-testid="settle-kind">
        <option value="final">final score</option>
        <option value="postponed">postponed</option>
        <option value="void">void</option>
        <option value="unresolved">unresolved</option>
      </select>
    </label>
    <label>
      Home score
      <input name="homeScore" inputmode="numeric" data-testid="settle-home" />
    </label>
    <label>
      Away score
      <input name="awayScore" inputmode="numeric" data-testid="settle-away" />
    </label>
    <label>
      Corrects notice
      <input name="correctsNoticeId" data-testid="settle-corrects" />
    </label>
    <label>
      Reason
      <input name="reason" data-testid="settle-reason" />
    </label>
    <Button type="submit">Record settlement</Button>
  </form>
  {#if form?.settled}
    <p class="pc-success" data-testid="settlement-recorded">{form.duplicate ? "Settlement already recorded" : "Settlement recorded"}</p>
  {/if}
  <ul class="pc-ledger" data-testid="settlements">
    {#each data.settlements as row (row.analysisId)}
      <li>
        <Badge data-testid="assessment-result">assessment {row.assessment.effective}</Badge>
        <ol class="pc-notices">
          {#each row.assessment.history as notice (notice.id)}
            <li data-testid="settlement-notice">
              <span data-testid="settlement-notice-id">{notice.id}</span>
              {notice.result} {notice.recordedAt}
              {#if notice.correctsId}corrects {notice.correctsId}{/if}
              {#if notice.reason}{notice.reason}{/if}
            </li>
          {/each}
        </ol>
        {#each row.bets as bet (bet.betId)}
          {#if bet.grade}
            <Badge data-testid="bet-result">bet {bet.grade.effective}</Badge>
          {/if}
        {/each}
      </li>
    {/each}
  </ul>
  <h2>Closing observations</h2>
  <p class="pc-hint" data-testid="closing-measure">
    A direct comparison is the change in decimal odds for the same market, side, point line, sportsbook,
    and rules. A different point line is line movement, not a change in odds. A missing observation is
    unavailable. It is not zero closing performance. An archived price without an observation time is not
    an executable offer and not a timestamped observation.
  </p>
  <form class="pc-form" method="POST" action="?/closing" data-testid="closing-form">
    <label>
      This close belongs to
      <select name="subjectKind" data-testid="closing-subject-kind">
        <option value="analysis">researched offer</option>
        <option value="bet">actual bet</option>
      </select>
    </label>
    <label>
      Record
      <select name="subjectId" required data-testid="closing-subject">
        <option value="">choose a record</option>
        {#each data.assessments as assessment (assessment.id)}
          <option value={assessment.id}>research: {label(assessment)}</option>
        {/each}
        {#each data.bets as bet (bet.id)}
          <option value={bet.id}>
            bet: {bet.sportsbook} {bet.market} {bet.selection} {signedLine(bet.pointLine)}
          </option>
        {/each}
      </select>
    </label>
    <label>
      Sportsbook
      <input name="sportsbook" required data-testid="closing-book" />
    </label>
    <label>
      Market
      <select name="market" data-testid="closing-market">
        <option value="moneyline">moneyline</option>
        <option value="spread">spread</option>
        <option value="total">total</option>
      </select>
    </label>
    <label>
      Selection
      <select name="selection" data-testid="closing-selection">
        <option value="home">home</option>
        <option value="away">away</option>
        <option value="over">over</option>
        <option value="under">under</option>
      </select>
    </label>
    <label>
      Point line
      <input name="pointLine" inputmode="decimal" data-testid="closing-line" />
    </label>
    <label>
      Tie rule (moneyline)
      <select name="tie" data-testid="closing-tie">
        <option value="">not a moneyline</option>
        <option value="push">push</option>
        <option value="loss">loss</option>
        <option value="win">win</option>
        <option value="void">void</option>
      </select>
    </label>
    <label>
      American odds
      <input name="americanOdds" required data-testid="closing-odds" />
    </label>
    <label>
      Observed at
      <input name="observedAt" type="datetime-local" required data-testid="closing-time" />
    </label>
    <label>
      Source
      <input name="source" required data-testid="closing-source" />
    </label>
    <Button type="submit">Record closing observation</Button>
  </form>
  {#if form?.recorded}
    <p class="pc-success" data-testid="closing-recorded">Closing observation recorded</p>
  {:else if form?.error}
    <Alert data-testid="form-error">{form.error}</Alert>
  {/if}
  <ul class="pc-ledger" data-testid="closings">
    {#each data.closings as closing (closing.id)}
      <li data-testid="closing-row">
        {#if closing.provenance === "archived-untimestamped"}
          <span data-testid="closing-archive">
            Archived price without an observation time: {closing.sportsbook} {closing.market}
            {closing.selection} {signedLine(closing.pointLine)} {closing.americanOdds}, source
            {closing.source}. Not an executable offer and not a timestamped observation.
          </span>
        {:else}
          <span data-testid="closing-observed">
            Observed {easternTime(closing.observedAt ?? "")} from {closing.source}: {closing.sportsbook}
            {closing.market} {closing.selection} {signedLine(closing.pointLine)} {closing.americanOdds}
          </span>
        {/if}
        {#if closing.comparison.available}
          <span data-testid="closing-comparison">
            Comparable odds change: {closing.comparison.openDecimal.toFixed(3)} to
            {closing.comparison.closeDecimal.toFixed(3)}
            ({closing.comparison.difference.toFixed(3)})
          </span>
        {:else}
          <span class="pc-unknown" data-testid="closing-unavailable">
            Direct price comparison unavailable ({closing.comparison.reason}).
            {#if closing.comparison.lineMovement}
              Line moved from {signedLine(closing.comparison.lineMovement.openPointLine)} to
              {signedLine(closing.comparison.lineMovement.closePointLine)}. This is not an odds change.
            {/if}
          </span>
        {/if}
      </li>
    {/each}
  </ul>
  {#if data.closings.length === 0}
    <p class="pc-unknown" data-testid="closing-missing">No closing observation. Closing performance is unavailable, not zero.</p>
  {/if}
</main>
