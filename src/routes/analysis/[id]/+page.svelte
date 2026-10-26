<script lang="ts">
  import { easternTime, percent, signedLine } from "#lib/format.ts";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const run = $derived(data.run);
  const report = $derived(data.run.report);
  const fixture = $derived(run.provider === "fixture");
  const refreshValue = (name: string, fallback: string | number) =>
    (form?.values as Record<string, string> | undefined)?.[name] ?? String(fallback);
  // The drafter's own notes, minus the gaps already listed from evidence collection.
  const drafterNotes = $derived(
    (report?.missingInputs ?? []).filter((note) => !run.gaps.includes(note)),
  );
  const published = (at: string) => (at === "unknown" ? "unknown" : easternTime(at));
  const submitRefresh = (event: Event) => {
    event.preventDefault();
    const target = event.currentTarget;
    const form =
      target instanceof HTMLFormElement
        ? target
        : target instanceof HTMLButtonElement
          ? target.form
          : null;
    if (!form || form.dataset.submitting === "true" || !form.reportValidity()) return;
    form.dataset.submitting = "true";
    const odds = form.querySelector<HTMLInputElement>('[data-testid="refresh-odds"]');
    const observed = form.querySelector<HTMLInputElement>('[data-testid="refresh-observed-at"]');
    const line = form.querySelector<HTMLInputElement>('[data-testid="refresh-line"]');
    const book = form.querySelector<HTMLInputElement>('[data-testid="refresh-book"]');
    const copy = (display: HTMLInputElement | null, name: string) => {
      const submitted = form.elements.namedItem(name);
      if (display && submitted instanceof HTMLInputElement) submitted.value = display.value;
    };
    copy(odds, "americanOdds");
    copy(observed, "observedAt");
    copy(line, "pointLine");
    copy(book, "sportsbook");
    const button = form.querySelector<HTMLButtonElement>('[data-testid="refresh"]');
    if (button) button.disabled = true;
    form.querySelector<HTMLElement>('[data-testid="submission-pending"]')?.removeAttribute("hidden");
    window.setTimeout(() => HTMLFormElement.prototype.submit.call(form), 50);
  };
</script>

<main>
  <h1>Report: {run.game.away} at {run.game.home}</h1>
  <p>{easternTime(run.game.kickoff)}, {run.game.venue ?? "venue unknown"}</p>
  {#if run.snapshotProvenance === "legacy-unknown"}
    <p data-testid="snapshot-provenance">
      This older record's game details were copied from the schedule during migration; its original
      kickoff and venue could not be confirmed.
    </p>
  {:else}
    <p data-testid="snapshot-provenance">Game and research offer captured with this report.</p>
  {/if}
  <p data-testid="status">{run.status}</p>
  {#if run.status !== "completed"}
    <section data-testid="recovery">
      <h2>Attempt recovery</h2>
      <p>
        This attempt and its completed stages are retained. External work will not be replayed
        automatically because a request may have completed before its response was saved. Start a
        new attempt below to research again.
      </p>
    </section>
  {/if}
  {#if run.parentId}
    <p>
      Refresh of <a href="/analysis/{run.parentId}" data-testid="parent-link">an earlier report</a>. That report is unchanged.
    </p>
  {/if}
  {#if form?.error}
    <p data-testid="form-error">{form.error}</p>
  {/if}

  <section data-testid="offer">
    <h2>Offer</h2>
    <p data-testid="offer-contract">
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
      {#if run.policy.reliesOnManualEvidence && run.policy.manualCoverage}
        <p data-testid="manual-coverage">
          This conclusion relies on your manual evidence for the
          {run.policy.manualCoverage
            .map((coverage) => (coverage.kind === "weather" ? "kickoff forecast" : "injury report"))
            .join(" and ")}.
        </p>
      {/if}
      {#if run.policy.blockingReason}
        <p>{run.policy.blockingReason}</p>
      {/if}
      <p>
        Expected value {run.policy.expectedValuePerUnit === null
          ? "unavailable"
          : `${run.policy.expectedValuePerUnit.toFixed(4)} units per unit staked`}
      </p>
      {#if run.policy.uncertainty}
        {@const uncertainty = run.policy.uncertainty}
        {#if uncertainty.available && run.policy.threshold}
          <p data-testid="conservative-ev">
            Conservative expected value at {Math.round(uncertainty.confidence * 100)}%
            confidence: {run.policy.conservativeExpectedValuePerUnit === null
              ? "unavailable"
              : `${run.policy.conservativeExpectedValuePerUnit.toFixed(4)} units`}. Threshold
            {run.policy.threshold.conservativeExpectedValue} ({run.policy.threshold.version}).
          </p>
        {:else if !uncertainty.available && uncertainty.reason !== "Not assessed."}
          <p data-testid="conservative-ev">Uncertainty: {uncertainty.reason}</p>
        {/if}
      {/if}
      {#if run.policy.priceCutoff?.available}
        <p>
          The conclusion changes at decimal odds below {run.policy.priceCutoff.decimalMinimum.toFixed(3)}.
        </p>
      {/if}
      <p>{run.policy.label}</p>
      <p>Policy {run.policy.policyVersion}</p>
    </section>
  {/if}

  <section data-testid="probability-model">
    <h2>Model</h2>
    {#if run.probabilityModel === null}
      <p>This run was saved before PocketCheck recorded a probability model.</p>
    {:else if run.probabilityModel.status === "unavailable"}
      <p>No model probabilities: {run.probabilityModel.reason}</p>
    {:else}
      <p>
        Artifact <code>{run.probabilityModel.artifact.checksum.slice(0, 12)}</code>, version
        {run.probabilityModel.artifact.version}, trained on games through
        {easternTime(run.probabilityModel.artifact.trainingCutoff)}.
      </p>
      {#if run.probabilityModel.eligible && run.probabilityModel.probabilities}
        {@const shown = run.probabilityModel.probabilities}
        <p data-testid="model-probabilities">
          Experimental: win {percent(shown.win)}, loss {percent(shown.loss)}, push
          {percent(shown.push)}.
        </p>
      {:else}
        <p>Not used for the {run.offer.market} market: {run.probabilityModel.reason}</p>
        <p>Its probabilities are recorded with this run but are not shown or used.</p>
      {/if}
    {/if}
  </section>

  <section>
    <h2>Evidence gaps</h2>
    {#if run.gaps.length > 0}
      <ul data-testid="evidence-gaps">
        {#each run.gaps as gap (gap)}
          <li>{gap}</li>
        {/each}
      </ul>
    {:else}
      <p data-testid="evidence-gaps">None found while collecting evidence.</p>
    {/if}
  </section>

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
              {published(item.publishedAt)})
              {#if item.url && /^https?:\/\//i.test(item.url)}<a href={item.url} rel="noreferrer">source</a>{/if}
            {/if}
          </li>
        {/each}
      </ul>
    </section>

    <section>
      {#if drafterNotes.length > 0}
        <h2>The drafter also noted</h2>
        <ul data-testid="missing-evidence">
          {#each drafterNotes as note (note)}
            <li>{note}</li>
          {/each}
        </ul>
      {/if}
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
  {:else if run.status === "failed"}
    <section>
      <h2>Drafting failed</h2>
      <p data-testid="failure">{run.failureReason}</p>
      <p>The evidence and price mathematics are kept.</p>
    </section>
  {:else if run.status !== "completed"}
    <section><h2>Report not completed</h2><p>This attempt has no finished report.</p></section>
  {/if}

  <section>
    <h2>All evidence in this run</h2>
    <ul data-testid="all-evidence">
      {#each run.evidence as item (item.id)}
        <li>
          <code>{item.id}</code>
          {item.excerpt ?? Object.entries(item.facts)
              .filter(([, value]) => value !== null && value !== "")
              .map(([key, value]) => `${key}: ${value}`)
              .join(", ")}
          ({item.origin}, published {published(item.publishedAt)})
          {#if item.url && /^https?:\/\//i.test(item.url)}<a href={item.url} rel="noreferrer">source</a>{/if}
        </li>
      {/each}
    </ul>
  </section>

  {#if run.lean}
    <section data-testid="user-lean">
      <h2>Your lean, recorded before this report</h2>
      <p>{run.lean.text}</p>
      {#if run.lean.rationale}
        <p>{run.lean.rationale}</p>
      {/if}
    </section>
  {/if}

  {#if !fixture}
    <p data-testid="usage">
      {#if run.usage}
        Drafting used {run.usage.totalTokens ?? "an unreported number of"} tokens
        {#if run.usage.promptTokens !== null && run.usage.completionTokens !== null}
          ({run.usage.promptTokens} prompt, {run.usage.completionTokens} completion)
        {/if}. Cost {run.usage.costUsd === null
          ? "not reported"
          : `$${run.usage.costUsd.toFixed(4)}, as reported by ${run.provider}`}.
      {:else}
        {run.provider} reported no usage for this run.
      {/if}
    </p>
  {/if}

  <ol data-testid="progress">
    {#each run.stages as stage (stage)}
      <li>{stage}</li>
    {/each}
  </ol>

  <form
    method="POST"
    action="?/refresh"
    onsubmit={submitRefresh}
  >
    <input
      type="hidden"
      name="requestId"
      value={refreshValue("requestId", data.refreshRequestId)}
    />
    <input type="hidden" name="cutoffAt" value={refreshValue("cutoffAt", data.refreshCutoffAt)} />
    <input
      type="hidden"
      name="scheduleRetrievedAt"
      value={refreshValue("scheduleRetrievedAt", data.refreshScheduleRetrievedAt)}
    />
    <input type="hidden" name="americanOdds" value={run.offer.americanOdds} />
    <input type="hidden" name="observedAt" value={data.refreshObservedDefault} />
    <input type="hidden" name="pointLine" value={run.offer.pointLine ?? ""} />
    <input type="hidden" name="sportsbook" value={run.offer.sportsbook} />
    <input type="hidden" name="market" value={run.offer.market} />
    <input type="hidden" name="selection" value={run.offer.selection} />
    <p role="status" data-testid="submission-pending" hidden>Saving your new attempt…</p>
    <h2>{run.status === "completed" ? "Refresh at a new price" : "Start a new attempt"}</h2>
    <p data-testid="refresh-keeps">
      Keeps {run.offer.market}, {run.offer.selection}. A different market or selection is a new analysis, not a refresh.
    </p>
    <label>
      Sportsbook
      <input
        name="displaySportsbook"
        value={refreshValue("sportsbook", run.offer.sportsbook)}
        required
        data-testid="refresh-book"
      />
    </label>
    {#if run.offer.market !== "moneyline"}
      <label>
        {run.offer.market === "spread" ? "Selected-side line" : "Total line"}
        <input
          name="displayPointLine"
          value={refreshValue("pointLine", run.offer.pointLine ?? "")}
          required
          inputmode="decimal"
          data-testid="refresh-line"
        />
      </label>
      <p data-testid="refresh-line-guidance">
        {run.offer.market === "spread"
          ? "The line belongs to the selected side. Changing the number does not change which side you researched."
          : "Over and under share this total. Changing the number does not change over or under."}
      </p>
    {/if}
    <label>
      American odds
      <input
        name="displayAmericanOdds"
        value={refreshValue("americanOdds", run.offer.americanOdds)}
        required
        data-testid="refresh-odds"
      />
    </label>
    <label>
      When you saw the new price
      <input
        type="datetime-local"
        name="displayObservedAt"
        value={refreshValue("observedAt", data.refreshObservedDefault)}
        required
        data-testid="refresh-observed-at"
      />
    </label>
    <button type="submit" data-testid="refresh">
      {run.status === "completed" ? "Refresh" : "Start new attempt"}
    </button>
  </form>
</main>
