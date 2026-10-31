<script lang="ts">
  import { Badge } from "#lib/components/ui/badge/index.ts";
  import { easternTime, percent } from "#lib/format.ts";
  import { marketComparison } from "#lib/domain/comparison.ts";
  import type { Market, SideSelection } from "#lib/domain/offer.ts";
  import type { PageProps } from "./$types";

  import { Alert } from "#lib/components/ui/alert/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";

  let { data, form }: PageProps = $props();
  const board = $derived(data.board);
  const grades = $derived(data.settlement.markets);
  const resultWord = (result: string) =>
    ({ win: "Won", loss: "Lost", push: "Push", void: "Void" })[result] ?? "Unresolved";

  const signed = (value: number) => (value > 0 ? `+${value}` : String(value));
  const units = (value: number) => `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(4)}`;
  const team = (selection: SideSelection) =>
    selection === "home" ? board.game.home : selection === "away" ? board.game.away : selection;
  const FEATURE_LABELS: Record<string, string> = {
    home_prior_margin: "Home team's recent point margin",
    away_prior_margin: "Away team's recent point margin",
    home_prior_points_for: "Home team's recent points scored",
    away_prior_points_for: "Away team's recent points scored",
    home_prior_points_against: "Home team's recent points allowed",
    away_prior_points_against: "Away team's recent points allowed",
    home_rest_days: "Home team's rest days",
    away_rest_days: "Away team's rest days",
    home_qb_share: "Home quarterback continuity",
    away_qb_share: "Away quarterback continuity",
    home_qb_rating: "Home quarterback rating",
    away_qb_rating: "Away quarterback rating",
    home_indicator: "Home field",
  };
  const points = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`;
  /** What each side's chance is a chance of: spreads and totals can push. */
  const CHANCE_LABELS: Record<Market, string> = {
    moneyline: "Chance to win",
    spread: "Chance to cover",
    total: "Chance to finish over or under",
  };
  const gap = (value: number) => {
    const shown = Math.abs(value).toFixed(1);
    return shown === "0.0" ? "0.0 pts" : `${value > 0 ? "+" : "−"}${shown} pts`;
  };
  /** The largest contributors to the market's own mean: margin for sides, total for totals. */
  const driversFor = (market: string, forecast: { drivers?: Drivers } | null) => {
    const part = market === "total" ? forecast?.drivers?.total : forecast?.drivers?.margin;
    if (!part) return null;
    const largest = [...part.contributions]
      .filter((item) => Math.abs(item.points) >= 0.005)
      .sort((left, right) => Math.abs(right.points) - Math.abs(left.points))
      .slice(0, 4);
    return { intercept: part.intercept, largest };
  };
  type Part = { intercept: number; contributions: Array<{ feature: string; points: number }> };
  type Drivers = { margin: Part; total: Part };
  const lined = (pointLine: number | null) => (pointLine === null ? "" : ` ${signed(pointLine)}`);
  const sideName = (selection: SideSelection) =>
    selection === "home" || selection === "away" ? `${team(selection)} (${selection})` : selection;
</script>

<main class="pc-page pc-report pc-board">
  <h1 class="pc-report-title">
    <span class="pc-kicker">Game board:</span>
    {board.game.away} <i>at</i> {board.game.home}
  </h1>
  <p class="pc-report-venue">{easternTime(board.game.kickoff)}, {board.game.venue ?? "venue unknown"}</p>
  <div class="pc-report-notes">
    {#if board.status === "completed"}
      <span class="pc-frozen">■ Frozen</span>
    {/if}
    <dl class="pc-report-times">
      <dt>Decision cutoff</dt>
      <dd>{easternTime(board.cutoffAt)}</dd>
      <dt>Kickoff</dt>
      <dd>{easternTime(board.game.kickoff)}</dd>
      <dt>Prices observed</dt>
      <dd>{easternTime(board.observedAt)}</dd>
    </dl>
    <p data-testid="board-sportsbook-display">Prices from {board.sportsbook}</p>
    <p class="pc-report-status">Status <span class="pc-figure" data-testid="board-status">{board.status}</span></p>
  </div>
  {#if board.withdrawal}
    <p class="pc-alert-block" data-testid="board-withdrawn">
      Withdrawn from performance {easternTime(board.withdrawal.at)}: {board.withdrawal.reason}. Its picks stay
      saved and are not counted.
    </p>
  {/if}
  {#if data.parent}
    <p data-testid="board-parent">
      Refreshes <a href="/board/{data.parent.id}" data-testid="parent-link">the earlier board</a> from
      {data.parent.sportsbook}, prices observed {easternTime(data.parent.observedAt)}. That board is unchanged.
    </p>
  {/if}
  {#if data.refreshes.length > 0}
    <ul class="pc-list" data-testid="board-refreshes">
      {#each data.refreshes as refresh (refresh.id)}
        <li>
          <a href="/board/{refresh.id}" data-testid="refresh-link">Refreshed board</a> from {refresh.sportsbook},
          prices observed {easternTime(refresh.observedAt)}
        </li>
      {/each}
    </ul>
  {/if}
  {#if board.status === "completed"}
    <p><a href="/board?refresh={board.id}" data-testid="refresh-board">Refresh with new prices</a></p>
  {/if}
  {#if board.failureReason}
    <section class="pc-alert-block" data-testid="board-failure">
      <h2>Board not completed</h2>
      <p>{board.failureReason}</p>
    </section>
  {/if}

  {#each board.markets as market (market.market)}
    <section class="pc-section pc-pick" data-testid="model-pick-{market.market}" aria-labelledby="pick-{market.market}">
      <h2 id="pick-{market.market}">{market.market[0].toUpperCase()}{market.market.slice(1)}</h2>
      {#if market.pick}
        {@const pick = market.pick}
        {@const calculation = pick.calculation}
        {@const picked = calculation.sides.find((side) => side.selection === calculation.pickedSelection)!}
        <p class="pc-tags">
          <Badge variant="dashed" data-testid="release-label">
            {calculation.release === "released" ? "Released model pick" : "Unvalidated model pick"}
          </Badge>
        </p>
        <div class="pc-chance" data-testid="chance-{market.market}">
          <p class="pc-kicker">{CHANCE_LABELS[market.market]}: forecasting model beside the sportsbook</p>
          <table class="pc-chance-table">
            <thead>
              <tr>
                <th scope="col">Side</th>
                <th scope="col">Model</th>
                <th scope="col">Market, no-vig</th>
                <th scope="col">Gap</th>
              </tr>
            </thead>
            <tbody>
              {#each calculation.sides as side (side.selection)}
                {@const compared = marketComparison(side)}
                <tr data-testid="chance-{side.selection}">
                  <th scope="row">{sideName(side.selection)}{lined(side.pointLine)}</th>
                  <td data-testid="chance-model">{percent(compared.model, 1)}</td>
                  <td data-testid="chance-market">{percent(compared.market, 1)}</td>
                  <td data-testid="chance-gap">{gap(compared.gapPoints)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if calculation.sides[0].probabilities.push > 0}
            <p class="pc-hint" data-testid="chance-push">
              The forecasting model gives a {percent(calculation.sides[0].probabilities.push, 1)} chance of a push. The market column sets the same
              share aside, so both columns count the same outcomes.
            </p>
          {/if}
        </div>
        <p data-testid="release-note">
          {#if calculation.release === "released"}
            This market passed the release gate. Release eligibility is not a profitability claim.
          {:else}
            The forecasting model has not beaten the closing market. This model pick is tracked, not
            evidence of an edge.
          {/if}
        </p>
        <p class="pc-kicker">Side chosen by the forecasting model: the better value at its price, not a predicted winner</p>
        <p class="pc-offer-line" data-testid="picked-side">
          {team(picked.selection)} {market.market}{lined(picked.pointLine)} {signed(picked.americanOdds)}
        </p>
        <p class="pc-pick-grade">Graded <span class="pc-figure" data-testid="strength-grade">{calculation.grade}</span></p>
        {@const graded = grades.find((item) => item.market === market.market)?.grade}
        {#if graded}
          <div data-testid="settlement-{market.market}">
            <p class="pc-kicker">Result of the picked side's own contract</p>
            <p class="pc-verdict-word" data-testid="pick-result">
              {#if graded.history.length === 0}
                <span class="pc-unknown">∅ Not settled</span>
              {:else}
                {resultWord(graded.effective)}
              {/if}
            </p>
            {#if graded.history.length > 0}
              <ol class="pc-notices">
                {#each graded.history as notice (notice.id)}
                  <li data-testid="pick-notice">
                    <span class="pc-figure">{resultWord(notice.result)}</span>
                    {easternTime(notice.recordedAt)}
                    {#if notice.correctsId}, corrects <span class="pc-figure">{notice.correctsId}</span>{/if}
                    {#if notice.reason}, {notice.reason}{/if}
                    <span class="pc-hint" data-testid="pick-notice-id">{notice.id}</span>
                  </li>
                {/each}
              </ol>
            {/if}
          </div>
        {/if}
        <p data-testid="grade-reason">
          {#if calculation.grade === "strong"}
            The conservative expected value clears the {calculation.threshold.version} threshold.
          {:else if calculation.grade === "lean"}
            Positive expected value at the entered price, short of strong.
            {#if calculation.materialEvidenceMissing}Material evidence is missing, so it cannot be graded strong.{/if}
          {:else if calculation.tieBreak === "home or over"}
            Both sides are level on the numbers, so home is named and graded no edge.
          {:else}
            Neither side clears the sportsbook's margin. This is the less bad side, not a good bet.
          {/if}
        </p>

        <div class="pc-pair pc-pick-sides">
          {#each calculation.sides as side (side.selection)}
            <dl class="pc-figures" data-testid="side-{side.selection}">
              <dt>Side</dt>
              <dd>{sideName(side.selection)}{lined(side.pointLine)}</dd>
              <dt>American odds</dt>
              <dd>{signed(side.americanOdds)}</dd>
              <dt>Model win</dt>
              <dd data-testid="model-win">{percent(side.probabilities.win)}</dd>
              <dt>Model loss</dt>
              <dd>{percent(side.probabilities.loss)}</dd>
              <dt>Model push</dt>
              <dd data-testid="model-push">{percent(side.probabilities.push)}</dd>
              <dt>No-vig probability</dt>
              <dd data-testid="no-vig">{percent(side.noVigProbability)}</dd>
              <dt>Expected value per unit</dt>
              <dd data-testid="expected-value">{units(side.expectedValue)}</dd>
              <dt>Conservative expected value</dt>
              <dd>
                {#if side.conservativeExpectedValue === null}
                  <span class="pc-unknown">∅ Unavailable</span>
                {:else}
                  {units(side.conservativeExpectedValue)}
                {/if}
              </dd>
            </dl>
          {/each}
        </div>
        <dl class="pc-figures">
          <dt>Sportsbook margin</dt>
          <dd data-testid="margin">{percent(calculation.margin)}</dd>
          <dt>Price cutoff</dt>
          <dd data-testid="price-cutoff">
            {#if calculation.priceCutoff.available}
              {calculation.priceCutoff.keeps ? "Keeps" : "Reaches"} {calculation.priceCutoff.grade} at prices better than
              {signed(calculation.priceCutoff.americanOdds)} ({calculation.priceCutoff.decimalOdds.toFixed(3)})
            {:else}
              {#if !calculation.priceCutoff.everyPriceKeeps}<span class="pc-unknown">∅ Unavailable</span>{/if}
              {calculation.priceCutoff.reason}
            {/if}
          </dd>
        </dl>
        {@const drivers = driversFor(market.market, pick.forecast)}
        <div class="pc-drivers" data-testid="drivers-{market.market}">
          <p class="pc-kicker">
            What moved the forecast: {market.market === "total" ? "predicted total" : "predicted margin, home minus away"}
          </p>
          {#if drivers}
            <ul class="pc-ledger" data-testid="driver-list">
              {#each drivers.largest as driver (driver.feature)}
                <li data-testid="driver">
                  {FEATURE_LABELS[driver.feature] ?? driver.feature}
                  <span class="pc-figure">{points(driver.points)} points</span>
                </li>
              {/each}
            </ul>
            <p class="pc-hint">
              Each effect is the model's coefficient times how far this input sits from the training average,
              added to a baseline of {drivers.intercept.toFixed(2)} points.
            </p>
          {:else}
            <p class="pc-hint" data-testid="drivers-unavailable">
              <span class="pc-unknown">∅ Unavailable</span> This model pick has no frozen forecast with drivers.
            </p>
          {/if}
        </div>
        <div class="pc-gaps" data-testid="gaps-{market.market}">
          <p class="pc-kicker">Evidence gaps</p>
          {#if board.gaps.length === 0}
            <p class="pc-hint">No gaps were recorded for this game.</p>
          {:else}
            <ul class="pc-ledger pc-gap-list">
              {#each board.gaps as gap (gap)}
                <li>{gap}</li>
              {/each}
            </ul>
          {/if}
          {#if calculation.materialEvidenceMissing}
            <p class="pc-hint">Material evidence is missing, so this model pick cannot be graded strong.</p>
          {/if}
          {#if pick.forecast}
            <p class="pc-hint" data-testid="starter-state">
              Starting quarterbacks:
              {#each [["away", board.game.away], ["home", board.game.home]] as [side, code] (side)}
                {@const starter = pick.forecast.starters[side as "home" | "away"]}
                {code}
                {starter.state}{starter.identity ? ` (${starter.identity}` : ""}{starter.source ? `, ${starter.source}` : ""}{starter.identity ? ")" : ""}{starter.reason ? `: ${starter.reason}` : ""}{side === "away" ? "; " : "."}
              {/each}
            </p>
          {/if}
        </div>
        <p class="pc-hint" data-testid="forecasting-model">
          Side chosen by forecasting model {pick.forecastingModel.checksum.slice(0, 12)}, version
          {pick.forecastingModel.version}, trained on games through
          {easternTime(pick.forecastingModel.trainingCutoff)}.
        </p>
        {#if pick.forecast?.weather}
          {@const weather = pick.forecast.weather}
          <p class="pc-hint" data-testid="weather-adjustment">
            {#if weather.reason === "roof"}
              Weather not applied: the roof is closed.
            {:else if weather.reason === "missing"}
              Weather not applied: no outdoor forecast was recorded. Missing is not zero wind.
            {:else}
              Weather recorded
              {#if weather.snapshot}
                (wind {weather.snapshot.windMph ?? "unknown"} mph, precipitation
                {weather.snapshot.precipitationChance ?? "unknown"}%,
                {weather.snapshot.temperatureF ?? "unknown"}F)
              {/if}
              and not applied: {weather.version}, no fitted adjustment yet.
            {/if}
          </p>
        {/if}
        {@const explained = board.explanation?.picks.find((item) => item.market === market.market)}
        <div class="pc-explanation" data-testid="explanation-{market.market}">
          <p class="pc-kicker">Explanation written by the drafter, not the forecasting model</p>
          {#if explained}
            <p data-testid="explanation-summary">{explained.summary}</p>
            <p class="pc-kicker">The strongest case for the other side</p>
            <p data-testid="explanation-other-side">{explained.otherSideCase}</p>
            <ul class="pc-ledger" data-testid="explanation-claims">
              {#each explained.claims as claim, index (index)}
                <li>
                  <strong>{claim.stance}:</strong>
                  {claim.text}
                  <span>[{claim.evidenceIds.join(", ")}]</span>
                </li>
              {/each}
            </ul>
          {:else if board.status === "failed"}
            <p class="pc-hint" data-testid="explanation-missing">
              <span class="pc-unknown">∅ No explanation</span> The drafter's text was not saved. The model pick above is unchanged.
            </p>
          {:else}
            <p class="pc-hint" data-testid="explanation-missing">
              <span class="pc-unknown">∅ No explanation</span> This board has no drafter explanation.
            </p>
          {/if}
        </div>
        <p>
          <a href="/journal?pick={pick.id}#bet-form" data-testid="record-bet-from-pick">Record an actual bet from this model pick</a>
        </p>
        <p class="pc-hint">
          Graded in code by <span class="pc-figure" data-testid="calculation-version">{calculation.version}</span>.
          The research analysis policy is separate and unchanged.
        </p>
      {:else if market.noPickReason !== null}
        <p data-testid="no-pick">
          <span class="pc-unknown">∅ No model pick</span>
          {market.noPickReason}
        </p>
      {:else}
        <p data-testid="no-pick"><span class="pc-unknown">∅ Not computed</span> This board stopped before its model picks were frozen.</p>
      {/if}
      {#if data.parent}
        {@const earlier = data.parent.markets.find((item) => item.market === market.market)}
        <p class="pc-hint" data-testid="parent-pick-{market.market}">
          {#if earlier?.pick}
            {@const before = earlier.pick.calculation.sides.find(
              (side) => side.selection === earlier.pick!.calculation.pickedSelection,
            )!}
            Earlier board: {team(before.selection)} {market.market}{lined(before.pointLine)} {signed(before.americanOdds)},
            graded {earlier.pick.calculation.grade}.
          {:else}
            The earlier board had no {market.market} model pick.
          {/if}
        </p>
      {/if}
      <p class="pc-hint">
        Entered: {sideName(market.offers[0].selection)}{lined(market.offers[0].pointLine)} {signed(market.offers[0].americanOdds)},
        {sideName(market.offers[1].selection)}{lined(market.offers[1].pointLine)} {signed(market.offers[1].americanOdds)}{#if market.offers[0].rules.tie}, tie rule {market.offers[0].rules.tie}{/if}.
      </p>
      {#if market.quotes.length > 0}
        <ul data-testid="board-quotes">
          {#each market.quotes as quote}
            <li>
              {quote.sportsbook}: {sideName(quote.selection)}{lined(quote.pointLine)} {signed(quote.americanOdds)}
              {#if quote.best}(best price){:else if !quote.sameLine}(different line, not compared){/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}

  {#if board.drafter}
    {@const fixture = board.drafter.id === "fixture"}
    <section class="pc-section" data-testid="drafter-section" aria-labelledby="drafter-title">
      <h2 id="drafter-title">Who wrote what</h2>
      <p data-testid="drafter">
        Explanation drafted by {board.drafter.modelId}{fixture
          ? " (fixture drafter, no AI call)"
          : ` via ${board.drafter.id}`}. The drafter explains the frozen model picks. It cannot change a side, a grade, or a number.
      </p>
      {#if board.providerOutcomeAmbiguous}
        <Alert data-testid="provider-outcome">
          Provider completion is ambiguous. This request may already have been charged. Start a new
          attempt before sending another provider request. Completion is not exactly once.
        </Alert>
      {/if}
      {#if !fixture}
        <div data-testid="usage">
          {#if board.usage}
            <p>
              Known usage across {board.providerRequests.length === 1
                ? "1 provider request"
                : `${board.providerRequests.length} provider requests`}
              {#if board.usage.partial}(partial){/if}:
              {board.usage.totalTokens === null ? "total tokens unknown" : `${board.usage.totalTokens} tokens`}.
              Cost {#if board.usage.costUsd === null}<span class="pc-unknown">unknown, not zero</span>{:else}${board.usage.costUsd.toFixed(4)}, as reported by {board.drafter.id}{/if}.
            </p>
          {:else}
            <p>{board.drafter.id} reported no usage for this board. Missing cost is unknown, not zero.</p>
          {/if}
          {#if board.providerRequests.length > 0}
            <ul class="pc-ledger" data-testid="provider-requests">
              {#each board.providerRequests as item (item.requestId + item.role)}
                <li>
                  {item.role} {item.requestId}: {item.outcome}.
                  {item.totalTokens === null ? "tokens unknown" : `${item.totalTokens} tokens`}.
                  Cost {item.costKnown && item.costUsd !== null ? `$${item.costUsd.toFixed(4)}` : "unknown"}.
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    </section>
  {/if}

  <section class="pc-section" aria-labelledby="settle-title">
    <h2 id="settle-title">Settle this game</h2>
    <p class="pc-hint">
      A final score belongs to the game, so it grades every model pick on every board of this game.
      A repeated event is ignored. A correction names the earlier notice and needs a reason.
    </p>
    <form class="pc-form" method="POST" action="?/settle" data-testid="settle-form">
      <label>Event identifier <input name="eventId" required data-testid="settle-event" /></label>
      <label>
        Kind
        <select name="kind" data-testid="settle-kind">
          <option value="final">final score</option>
          <option value="postponed">postponed</option>
          <option value="void">void</option>
          <option value="unresolved">unresolved</option>
        </select>
      </label>
      <label>{board.game.home} (home) score <input name="homeScore" inputmode="numeric" data-testid="settle-home" /></label>
      <label>{board.game.away} (away) score <input name="awayScore" inputmode="numeric" data-testid="settle-away" /></label>
      <label>Corrects notice <input name="correctsNoticeId" data-testid="settle-corrects" /></label>
      <label>Reason <input name="reason" data-testid="settle-reason" /></label>
      <Button type="submit" data-testid="settle-submit">Record settlement</Button>
    </form>
    {#if form?.settled}
      <p class="pc-success" data-testid="settlement-recorded">{form.duplicate ? "Settlement already recorded" : "Settlement recorded"}</p>
    {:else if form?.error}
      <Alert data-testid="settlement-error">{form.error}</Alert>
    {/if}
  </section>
  {#if board.status !== "pending" && !board.withdrawal}
    <section class="pc-section" aria-labelledby="withdraw-title">
      <h2 id="withdraw-title">Withdraw from performance</h2>
      <p class="pc-hint">
        For a test or a mistaken entry. The board and its picks stay saved but stop counting in model-pick
        performance. A withdrawn primary pick is not replaced. This cannot be undone.
      </p>
      <form class="pc-form" method="POST" action="?/withdraw" data-testid="withdraw-form">
        <label>Reason <input name="reason" required data-testid="withdraw-reason" /></label>
        <Button type="submit" variant="outline" data-testid="withdraw-submit">Withdraw this board</Button>
      </form>
      {#if form && "withdrawError" in form && form.withdrawError}
        <Alert data-testid="withdraw-error">{form.withdrawError}</Alert>
      {/if}
    </section>
  {/if}
  {#if board.lean}
    <section class="pc-section" data-testid="board-lean" aria-labelledby="board-lean-title">
      <h2 id="board-lean-title">Your private lean</h2>
      <p>{board.lean.text}</p>
      {#if board.lean.rationale}<p class="pc-hint">{board.lean.rationale}</p>{/if}
      <p class="pc-hint">Saved beside this board. It is not in the evidence, the forecast, or any model pick.</p>
    </section>
  {/if}
</main>
