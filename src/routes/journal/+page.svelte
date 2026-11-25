<script lang="ts">
  import { Alert } from "#lib/components/ui/alert/index.ts";
  import { Badge } from "#lib/components/ui/badge/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { easternTime, signedLine } from "#lib/format.ts";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const start = $derived(data.pickBet);
  const value = (action: string, name: string, fallback: string | number | null = "") =>
    form?.action === action ? (form.values[name] ?? "") : (fallback ?? "");
  const label = (assessment: (typeof data.assessments)[number]) =>
    `${assessment.game.away} at ${assessment.game.home}: ${assessment.offer.market} ${assessment.offer.selection} ${signedLine(assessment.offer.pointLine)} ${assessment.offer.americanOdds}`;
  const pickBetGrade = (betId: string) =>
    data.pickBetGrades.find((row) => row.betId === betId)?.grade ?? null;
  const withoutClose = $derived(
    [
      ...data.assessments.map((row) => row.id),
      ...data.bets.map((row) => row.id),
      ...data.modelPicks.map((row) => row.pick.id),
    ].filter((id) => !data.closings.some((closing) => closing.subject.id === id)).length,
  );
</script>

{#snippet occurrenceInput(action: string)}
  <label>
    Repeated Eastern time (only when clocks move back)
    <select name="timeOccurrence" value={value(action, "timeOccurrence")}>
      <option value="">choose if the time occurs twice</option>
      <option value="earlier">earlier occurrence (daylight time)</option>
      <option value="later">later occurrence (standard time)</option>
    </select>
  </label>
{/snippet}

<main class="pc-page pc-journal">
  <h1>Journal</h1>
  <datalist id="sportsbook-options">
    {#each data.knownSportsbooks as book}
      <option value={book}></option>
    {/each}
  </datalist>
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
  {#if form?.action === "restore" && form.outcome === "success"}
    <p class="pc-success" data-testid="restore-recorded">Journal restored. Pending attempts stay readable and are not replayed.</p>
  {:else if form?.action === "restore" && form.error}
    <Alert data-testid="form-error">{form.error}</Alert>
  {/if}
  <h2>Assessments</h2>
  <p>Every completed assessment is listed, including passes. Refreshes are listed separately from their originals.</p>
  {#each [data.performance.descriptive.assessments, data.performance.descriptive.bets] as metrics (metrics.cohort)}
    <section class="pc-section" aria-label={metrics.cohort}>
      <h3>{metrics.cohort === "primary-assessments" ? "Primary assessment" : "Actual bet"} descriptive metrics</h3>
      <h4>Raw same-contract price movement</h4>
      {#if metrics.rawSameContractPriceMovement.available}
        <p>Mean decimal odds change {metrics.rawSameContractPriceMovement.meanDecimalOddsChange.toFixed(4)}.
          Denominator {metrics.rawSameContractPriceMovement.denominator} distinct records.</p>
      {:else}
        <p class="pc-unknown">Unavailable. No comparable later price denominator.</p>
      {/if}
      <h4>Two-sided no-vig calibration</h4>
      {#if metrics.twoSidedNoVigCalibration.available}
        {@const metric = metrics.twoSidedNoVigCalibration}
        <p>Denominator {metric.denominator} settled records with captured forecasts and qualified later closes.</p>
        <p>Frozen model Brier {metric.model.brier.toFixed(4)}, no-vig close Brier {metric.closing.brier.toFixed(4)}.
          Frozen model log loss {metric.model.logLoss.toFixed(4)}, no-vig close log loss {metric.closing.logLoss.toFixed(4)}.</p>
        <p>Mean frozen win probability minus no-vig close {metric.meanWinProbabilityDifference.toFixed(4)}.</p>
        {#if metric.modelWinCalibrationBias !== null}
          <p>Mean frozen win probability minus observed win rate on {metric.decisiveDenominator} decisive picks {metric.modelWinCalibrationBias.toFixed(4)}.</p>
        {:else}
          <p class="pc-unknown">Win-rate bias unavailable. No decisive settled picks.</p>
        {/if}
      {:else}
        <p class="pc-unknown">Unavailable. No qualified frozen forecast, later two-sided close, and outcome denominator.</p>
      {/if}
      <p class="pc-hint">Raw price movement is not a no-vig edge or profitability measure. Closing probabilities reuse frozen push mass.
        Actual bets use a linked frozen forecast only when their own saved market, side, line, sportsbook, and rules match.</p>
    </section>
  {/each}

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
        Return {data.performance.assessments.roi.roi.toFixed(4)} per unit
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
        Return {data.performance.bets.roi.roi.toFixed(4)} per unit
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
  <form class="pc-form" id="bet-form" method="POST" action={start ? `?/bet&pick=${start.modelPickId}` : "?/bet"} data-testid="bet-form">
    {#if start}
      <p class="pc-hint" data-testid="bet-pick-start">
        Starting from the model pick for {start.game}. These are starting values. Change anything that
        differs from what you placed. <a href="/board/{start.boardId}">Back to the board</a>
      </p>
      <input type="hidden" name="modelPickId" value={start.modelPickId} />
    {:else}
      <label>
        Analysis
        <select name="analysisId" value={value("bet", "analysisId")} required data-testid="bet-analysis">
          <option value="">choose an analysis</option>
          {#each data.assessments as assessment (assessment.id)}
            <option value={assessment.id}>{label(assessment)}</option>
          {/each}
        </select>
      </label>
    {/if}
    <label>
      Submission identifier
      <input name="submissionId" required data-testid="bet-submission" value={value("bet", "submissionId", start?.submissionId)} />
    </label>
    <label>
      Sportsbook you used
      <input name="sportsbook" list="sportsbook-options" required data-testid="bet-sportsbook" value={value("bet", "sportsbook", start?.sportsbook)} />
    </label>
    <label>
      Market you placed
      <select name="market" value={value("bet", "market", start?.market ?? "moneyline")} data-testid="bet-market">
        {#each ["moneyline", "spread", "total"] as option (option)}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </label>
    <label>
      Selection you placed
      <select name="selection" value={value("bet", "selection", start?.selection ?? "home")} data-testid="bet-selection">
        {#each ["home", "away", "over", "under"] as option (option)}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </label>
    <label>
      Line you placed (selected side, spread or total)
      <input name="pointLine" inputmode="decimal" data-testid="bet-line" value={value("bet", "pointLine", start?.pointLine)} />
    </label>
    <label>
      Tie rule (moneyline)
      <select name="tie" value={value("bet", "tie", start?.tie)} data-testid="bet-tie">
        <option value="">not a moneyline</option>
        {#each ["push", "loss", "win", "void"] as option (option)}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </label>
    <label>
      American odds you got
      <input name="americanOdds" required data-testid="bet-odds" value={value("bet", "americanOdds", start?.americanOdds)} />
    </label>
    <label>
      Stake units
      <input name="stakeUnits" value={value("bet", "stakeUnits")} required inputmode="decimal" />
    </label>
    <Button type="submit">Record bet</Button>
  </form>
  {#if form?.action === "bet" && form.outcome === "success"}
    <p class="pc-success" data-testid="bet-recorded">Bet recorded</p>
  {:else if form?.action === "bet" && form.error}
    <Alert data-testid="form-error">{form.error}</Alert>
  {/if}
  <ul class="pc-ledger" data-testid="bets">
    {#each data.bets as bet (bet.id)}
      <li>
        {#if bet.contractProvenance === "captured"}
          <a href={bet.analysisId ? `/analysis/${bet.analysisId}` : "/journal"} data-testid="bet-contract">
            {bet.sportsbook} {bet.market} {bet.selection} {signedLine(bet.pointLine)} {bet.americanOdds}
            for {bet.stakeUnits} units, placed {easternTime(bet.placedAt)}, full game, overtime included
            {#if bet.rules?.tie}, tie {bet.rules.tie}{/if}
          </a>
          {#if bet.modelPickId}<Badge variant="dashed" data-testid="bet-from-pick">from a model pick</Badge>{/if}
        {:else}
          <a href={bet.analysisId ? `/analysis/${bet.analysisId}` : "/journal"}>
            {bet.sportsbook} {bet.americanOdds} for {bet.stakeUnits} units
          </a>
          <Badge variant="dashed" data-testid="legacy-bet-provenance">
            placed {easternTime(bet.placedAt)}. The market, line, and rules of this placement were not recorded.
          </Badge>
        {/if}
        {#if pickBetGrade(bet.id)}
          {@const grade = pickBetGrade(bet.id)!}
          <Badge data-testid="pick-bet-result">{grade.effective}</Badge>
          {#each grade.history as notice (notice.id)}
            <span data-testid="pick-bet-notice">
              <span data-testid="pick-bet-notice-id">{notice.id}</span>
              {notice.result} {notice.recordedAt}
              {#if notice.correctsId}corrects {notice.correctsId}{/if}
              {#if notice.reason}{notice.reason}{/if}
            </span>
          {/each}
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
      <select name="analysisId" value={value("settle", "analysisId")} data-testid="settle-analysis">
        <option value="">choose an analysis</option>
        {#each data.assessments as assessment (assessment.id)}
          <option value={assessment.id}>{label(assessment)}</option>
        {/each}
      </select>
    </label>
    <label>
      Actual bet (optional, for the record reference)
      <select name="betId" value={value("settle", "betId")} data-testid="settle-bet">
        <option value="">research assessment only</option>
        {#each data.bets as bet (bet.id)}
          <option value={bet.id}>{bet.sportsbook} {bet.market} {signedLine(bet.pointLine)}</option>
        {/each}
      </select>
    </label>
    <label>
      Event identifier
      <input name="eventId" value={value("settle", "eventId")} required data-testid="settle-event" />
    </label>
    <label>
      Kind
      <select name="kind" value={value("settle", "kind", "final")} data-testid="settle-kind">
        <option value="final">final score</option>
        <option value="postponed">postponed</option>
        <option value="void">void</option>
        <option value="unresolved">unresolved</option>
      </select>
    </label>
    <label>
      Home score
      <input name="homeScore" value={value("settle", "homeScore")} inputmode="numeric" data-testid="settle-home" />
    </label>
    <label>
      Away score
      <input name="awayScore" value={value("settle", "awayScore")} inputmode="numeric" data-testid="settle-away" />
    </label>
    <label>
      Corrects notice
      <select name="correctsNoticeId" value={value("settle", "correctsNoticeId")} data-testid="settle-corrects">
        <option value="">new notice, not a correction</option>
        {#each [...new Map([...data.settlements.flatMap((row) => [...row.assessment.history, ...row.bets.flatMap((bet) => bet.grade?.history ?? [])]), ...data.pickBetGrades.flatMap((row) => row.grade?.history ?? [])].map((notice) => [notice.id, notice])).values()] as notice (notice.id)}
          <option value={notice.id}>{notice.id} · {notice.result} · {easternTime(notice.recordedAt)}</option>
        {/each}
      </select>
    </label>
    <label>
      Reason
      <input name="reason" value={value("settle", "reason")} data-testid="settle-reason" />
    </label>
    <Button type="submit">Record settlement</Button>
  </form>
  {#if form?.action === "settle" && form.outcome === "success"}
    <p class="pc-success" data-testid="settlement-recorded">{form.duplicate ? "Settlement already recorded" : "Settlement recorded"}</p>
  {:else if form?.action === "settle" && form.error}
    <Alert data-testid="settlement-form-error">{form.error}</Alert>
  {/if}
  <ul class="pc-ledger" data-testid="settlements">
    {#each data.settlements as row (row.analysisId)}
      <li>
        {#if row.assessment}
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
        {/if}
        {#each row.bets as bet (bet.betId)}
          {#if bet.grade}
            <Badge data-testid="bet-result">bet {bet.grade.effective}</Badge>
          {/if}
        {/each}
      </li>
    {/each}
  </ul>
  <h2>Prospective evaluation</h2>
  <p class="pc-hint">Register a forecasting artifact before recording forecasts for evaluation. Registration cannot apply to earlier forecasts. A market can be released only when protocol prospective-2026-10-26 meets its requirements.</p>
  <form class="pc-form" method="POST" action="?/registerProtocol" data-testid="protocol-form">
    <label>
      Forecasting artifact checksum
      <input name="artifactChecksum" value={value("registerProtocol", "artifactChecksum")} required pattern={"[0-9a-fA-F]{64}"} data-testid="protocol-checksum" />
    </label>
    <Button type="submit">Register evaluation</Button>
  </form>
  {#if form?.action === "registerProtocol" && form.outcome === "success"}<p class="pc-success" data-testid="protocol-recorded">Evaluation registered</p>{/if}
  {#if form?.action === "registerProtocol" && form.error}<Alert data-testid="protocol-form-error">{form.error}</Alert>{/if}
  <ul class="pc-ledger" data-testid="protocol-registrations">
    {#each data.registrations as registration (registration.id)}
      <li><span class="pc-figure">{registration.protocol.artifactChecksum}</span> registered {easternTime(registration.registeredAt)}</li>
    {/each}
  </ul>

  <h2>Two-sided closing markets</h2>
  <p class="pc-hint">Record both prices from one sportsbook at the same time. This gives prospective evaluation a closing market for comparison.</p>
  <form class="pc-form" method="POST" action="?/closingMarket" data-testid="closing-market-form">
    <label>
      Game
      <select name="gameId" value={value("closingMarket", "gameId")} required data-testid="closing-market-game">
        <option value="">choose a game</option>
        {#each [...new Map(data.modelPicks.map((item) => [item.game.id, item.game])).values()] as game (game.id)}
          <option value={game.id}>{game.away} at {game.home}</option>
        {/each}
      </select>
    </label>
    <label>Sportsbook <input name="sportsbook" list="sportsbook-options" value={value("closingMarket", "sportsbook")} required data-testid="closing-market-book" /></label>
    <label>
      Market
      <select name="market" value={value("closingMarket", "market", "moneyline")} data-testid="closing-market-type">
        <option value="moneyline">moneyline</option>
        <option value="spread">spread</option>
        <option value="total">total</option>
      </select>
    </label>
    <label>Home spread or total line <input name="pointLine" value={value("closingMarket", "pointLine")} inputmode="decimal" data-testid="closing-market-line" /></label>
    <label>Home or over American odds <input name="firstOdds" value={value("closingMarket", "firstOdds")} inputmode="numeric" required data-testid="closing-market-first" /></label>
    <label>Away or under American odds <input name="secondOdds" value={value("closingMarket", "secondOdds")} inputmode="numeric" required data-testid="closing-market-second" /></label>
    <label>
      Moneyline tie rule
      <select name="tie" value={value("closingMarket", "tie")} data-testid="closing-market-tie">
        <option value="">choose for a moneyline</option>
        <option value="push">push</option>
        <option value="loss">loss</option>
        <option value="win">win</option>
        <option value="void">void</option>
      </select>
    </label>
    <label>Observed at (America/New_York) <input name="observedAt" value={value("closingMarket", "observedAt")} type="datetime-local" required data-testid="closing-market-time" /></label>
    {@render occurrenceInput("closingMarket")}
    <label>Source <input name="source" value={value("closingMarket", "source")} required data-testid="closing-market-source" /></label>
    <Button type="submit">Record closing market</Button>
  </form>
  {#if form?.action === "closingMarket" && form.outcome === "success"}<p class="pc-success" data-testid="closing-market-recorded">Closing market recorded</p>{/if}
  {#if form?.action === "closingMarket" && form.error}
    <Alert data-testid="prospective-form-error">{form.error}</Alert>
  {/if}
  <ul class="pc-ledger" data-testid="closing-markets">
    {#each data.closingMarkets as snapshot (snapshot.id)}
      <li>{snapshot.market} at {snapshot.offers[0].sportsbook}, observed {easternTime(snapshot.observedAt)}. {snapshot.offers[0].selection} {snapshot.offers[0].americanOdds}, {snapshot.offers[1].selection} {snapshot.offers[1].americanOdds}. {snapshot.source}</li>
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
      <select name="subjectKind" value={value("closing", "subjectKind", "analysis")} data-testid="closing-subject-kind">
        <option value="analysis">researched offer</option>
        <option value="bet">actual bet</option>
        <option value="model-pick">model pick</option>
      </select>
    </label>
    <label>
      Record
      <select name="subjectId" value={value("closing", "subjectId")} required data-testid="closing-subject">
        <option value="">choose a record</option>
        {#each data.assessments as assessment (assessment.id)}
          <option value={assessment.id}>research: {label(assessment)}</option>
        {/each}
        {#each data.bets as bet (bet.id)}
          <option value={bet.id}>
            bet: {bet.sportsbook} {bet.market} {bet.selection} {signedLine(bet.pointLine)}
          </option>
        {/each}
        {#each data.modelPicks as listed (listed.pick.id)}
          <option value={listed.pick.id}>
            model pick: {listed.game.away} at {listed.game.home}, {listed.pick.market} {listed.offer.selection}{listed.offer.pointLine === null ? "" : ` ${listed.offer.pointLine}`}
          </option>
        {/each}
      </select>
    </label>
    <label>
      Sportsbook
      <input name="sportsbook" list="sportsbook-options" value={value("closing", "sportsbook")} required data-testid="closing-book" />
    </label>
    <label>
      Market
      <select name="market" value={value("closing", "market", "moneyline")} data-testid="closing-market">
        <option value="moneyline">moneyline</option>
        <option value="spread">spread</option>
        <option value="total">total</option>
      </select>
    </label>
    <label>
      Selection
      <select name="selection" value={value("closing", "selection", "home")} data-testid="closing-selection">
        <option value="home">home</option>
        <option value="away">away</option>
        <option value="over">over</option>
        <option value="under">under</option>
      </select>
    </label>
    <label>
      Point line
      <input name="pointLine" value={value("closing", "pointLine")} inputmode="decimal" data-testid="closing-line" />
    </label>
    <label>
      Tie rule (moneyline)
      <select name="tie" value={value("closing", "tie")} data-testid="closing-tie">
        <option value="">not a moneyline</option>
        <option value="push">push</option>
        <option value="loss">loss</option>
        <option value="win">win</option>
        <option value="void">void</option>
      </select>
    </label>
    <label>
      American odds
      <input name="americanOdds" value={value("closing", "americanOdds")} required data-testid="closing-odds" />
    </label>
    <label>
      Observed at (America/New_York)
      <input name="observedAt" value={value("closing", "observedAt")} type="datetime-local" required data-testid="closing-time" />
    </label>
    {@render occurrenceInput("closing")}
    <label>
      Source
      <input name="source" value={value("closing", "source")} required data-testid="closing-source" />
    </label>
    <Button type="submit">Record closing observation</Button>
  </form>
  {#if form?.action === "closing" && form.outcome === "success"}
    <p class="pc-success" data-testid="closing-recorded">Closing observation recorded</p>
  {:else if form?.action === "closing" && form.error}
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
  {#if withoutClose > 0}
    <p class="pc-unknown" data-testid="closing-missing">
      {withoutClose} {withoutClose === 1 ? "record has" : "records have"} no closing observation. Closing
      performance is unavailable, not zero.
    </p>
  {/if}
</main>
