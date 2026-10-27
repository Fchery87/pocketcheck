<script lang="ts">
  import type { CohortSummary } from "#lib/server/analysis/summary.ts";
  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const performance = $derived(data.performance);

  const signed = (value: number) => (value > 0 ? `+${value}` : String(value));
  const lined = (pointLine: number | null) => (pointLine === null ? "" : ` ${signed(pointLine)}`);
  const resultWord = (result: string) =>
    ({ win: "Won", loss: "Lost", push: "Push", void: "Void" })[result] ?? "Unresolved";
  const unit = (value: number) => `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(3)}`;
  const title = (value: string) => value[0]!.toUpperCase() + value.slice(1);

  const slices = $derived([
    ...(["moneyline", "spread", "total"] as const).map((market) => ({
      key: `market-${market}`,
      label: title(market),
      summary: performance.byMarket[market],
    })),
    ...(["strong", "lean", "no edge"] as const).map((grade) => ({
      key: `grade-${grade.replace(" ", "-")}`,
      label: `Graded ${grade}`,
      summary: performance.byGrade[grade],
    })),
  ]);
</script>

{#snippet counts(summary: CohortSummary, prefix: string)}
  <p data-testid="{prefix}-counts">
    {summary.counts.primary} primary,
    {summary.counts.settled} settled,
    {summary.counts.unresolved} unresolved,
    {summary.counts.push} push,
    {summary.counts.void} void,
    {summary.counts.missingClosing} missing closing
  </p>
  <p data-testid="{prefix}-denominators">
    Return denominator {summary.denominators.returnOnSettledStakes} settled units.
    Closing comparisons {summary.denominators.closingComparisons}.
  </p>
  <p data-testid="{prefix}-roi">
    {#if summary.roi.available}
      Return {summary.roi.roi.toFixed(4)} per unit
    {:else}
      <span class="pc-unknown">Return unavailable</span>
    {/if}
  </p>
{/snippet}

<main class="pc-page" data-testid="model-pick-performance">
  <h1 class="pc-report-title"><span class="pc-kicker">Journal:</span> Model pick performance</h1>
  <p class="pc-hint">
    One unit on each primary model pick's own contract. This is separate from research assessments and
    from the actual bets you place. A refreshed board never adds a second observation for its game and
    market. Return uses only wins and losses. Push, void, unresolved, and a missing close are not zero.
  </p>
  <p class="pc-hint" data-testid="performance-excluded">
    Left out of this sample: {performance.excluded.refresh} refresh,
    {performance.excluded.ineligible} ineligible,
    {performance.excluded.unclassified} unclassified.
  </p>

  <section class="pc-section" data-testid="model-pick-summary" aria-labelledby="overall-title">
    <h2 id="overall-title">All primary model picks</h2>
    {@render counts(performance.overall, "overall")}
  </section>

  {#each slices as slice (slice.key)}
    <section class="pc-section" data-testid="slice-{slice.key}">
      <h3>{slice.label}</h3>
      {@render counts(slice.summary, slice.key)}
    </section>
  {/each}

  <h2>Primary model picks</h2>
  {#if performance.rows.length === 0}
    <p class="pc-unknown" data-testid="no-primary-picks">
      No primary model pick yet. Freeze a <a href="/board">game board</a> before kickoff.
    </p>
  {:else}
    <ul data-testid="primary-pick-list">
      {#each performance.rows as row (row.pickId)}
        <li data-testid="primary-pick">
          <a href="/board/{row.boardId}">{row.game}</a>,
          {title(row.market)}: {row.selection}{lined(row.pointLine)} {signed(row.americanOdds)},
          {row.grade}.
          <span data-testid="pick-row-result">{resultWord(row.result)}</span>
          {#if row.unitProfit !== null && (row.result === "win" || row.result === "loss")}
            <span data-testid="pick-row-return">{unit(row.unitProfit)} units</span>
          {:else if row.result === "push" || row.result === "void"}
            <span data-testid="pick-row-return">stake returned</span>
          {:else}
            <span class="pc-unknown" data-testid="pick-row-return">return unavailable</span>
          {/if}
          <span data-testid="pick-row-closing">
            {#if row.closing.state === "comparable"}
              Close moved {row.closing.difference >= 0 ? "+" : "-"}{Math.abs(row.closing.difference).toFixed(3)} in
              decimal odds
            {:else if row.closing.state === "line-movement"}
              <span class="pc-unknown">
                Line moved from {row.closing.openPointLine ?? "none"} to {row.closing.closePointLine ?? "none"}.
                Not an odds change.
              </span>
            {:else if row.closing.state === "unavailable"}
              <span class="pc-unknown">Close not comparable ({row.closing.reason})</span>
            {:else}
              <span class="pc-unknown">No close recorded</span>
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</main>
