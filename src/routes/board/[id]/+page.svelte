<script lang="ts">
  import { Badge } from "#lib/components/ui/badge/index.ts";
  import { easternTime, percent } from "#lib/format.ts";
  import type { SideSelection } from "#lib/domain/offer.ts";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const board = $derived(data.board);

  const signed = (value: number) => (value > 0 ? `+${value}` : String(value));
  const units = (value: number) => `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(4)}`;
  const team = (selection: SideSelection) =>
    selection === "home" ? board.game.home : selection === "away" ? board.game.away : selection;
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
        <p data-testid="release-note">
          {#if calculation.release === "released"}
            This market passed the release gate. Release eligibility is not a profitability claim.
          {:else}
            The forecasting model has not beaten the closing market. This model pick is tracked, not
            evidence of an edge.
          {/if}
        </p>
        <p class="pc-kicker">Side chosen by the forecasting model</p>
        <p class="pc-offer-line" data-testid="picked-side">
          {team(picked.selection)} {market.market}{lined(picked.pointLine)} {signed(picked.americanOdds)}
        </p>
        <p class="pc-verdict-word" data-testid="strength-grade">{calculation.grade}</p>
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
        <p class="pc-hint" data-testid="forecasting-model">
          Forecasting model {pick.forecastingModel.checksum.slice(0, 12)}, version
          {pick.forecastingModel.version}, trained on games through
          {easternTime(pick.forecastingModel.trainingCutoff)}.
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
    </section>
  {/each}
</main>
