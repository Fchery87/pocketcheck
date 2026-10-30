<script lang="ts">
  import { Alert } from "#lib/components/ui/alert/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { stepAmericanOdds, stepPointLine, type StepDirection } from "#lib/domain/stepper.ts";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const prefilled = $derived(data.refresh?.values as Record<string, string> | undefined);
  /** Typed values win, then the board being refreshed, then the default. */
  const value = (name: string, fallback = "") =>
    (form?.values as Record<string, string> | undefined)?.[name] ??
    prefilled?.[name] ??
    fallback;
  let selectedId = $derived(value("gameId") || data.games[0]?.id || "");
  const isRefresh = $derived(value("parentId") !== "");
  const selected = $derived(data.games.find((game) => game.id === selectedId) ?? data.games[0]);
  let formElement: HTMLFormElement | undefined = $state();
  const blankRow = () => ({ text: "", url: "", time: "", covers: "", team: "" });
  let manualRows = $derived(form?.manual?.length ? form.manual : [blankRow()]);
  const blankQuote = () => ({
    sportsbook: "",
    market: "moneyline",
    selection: "away",
    americanOdds: "",
    pointLine: "",
    observedAt: "",
  });
  let quoteRows = $state([blankQuote()]);
  $effect(() => {
    const kept = form?.quotes;
    if (kept?.length) quoteRows = kept.map((row) => ({ ...blankQuote(), ...row }));
  });

  const parseOdds = (text: string) => {
    const odds = Number(text.trim().replace("−", "-"));
    return text.trim() !== "" && Number.isInteger(odds) && Math.abs(odds) >= 100 ? odds : null;
  };

  const field = (name: string) =>
    formElement?.querySelector<HTMLInputElement>(`input[name="${name}"]`) ?? null;
  const touch = (input: HTMLInputElement) => input.dispatchEvent(new Event("input", { bubbles: true }));

  const step = (name: string, direction: StepDirection) => {
    const input = field(name);
    if (!input) return;
    const next = stepAmericanOdds(parseOdds(input.value), direction);
    input.value = next > 0 ? `+${next}` : String(next);
    touch(input);
  };

  const parseLine = (text: string) => {
    const line = Number(text.trim().replace("−", "-"));
    return text.trim() !== "" && Number.isFinite(line) ? line : null;
  };
  const lineText = (line: number, signed: boolean) => (signed && line > 0 ? `+${line}` : String(line));

  const stepLine = (name: string, direction: StepDirection, signed: boolean) => {
    const input = field(name);
    if (!input) return;
    input.value = lineText(stepPointLine(parseLine(input.value), direction), signed);
    touch(input);
  };

  /** The away spread line fills in as the mirror of the home line; it stays editable. */
  const mirrorSpread = (event: Event) => {
    const away = field("spreadAwayLine");
    const home = parseLine((event.currentTarget as HTMLInputElement).value);
    if (away && home !== null) away.value = lineText(-home + 0, true);
  };

  const sides = $derived([
    { name: "moneylineAway", testId: "moneyline-away", role: "away", team: selected?.away },
    { name: "moneylineHome", testId: "moneyline-home", role: "home", team: selected?.home },
  ]);
  const spreadSides = $derived([
    { price: "spreadAway", line: "spreadAwayLine", testId: "spread-away", role: "away", team: selected?.away },
    { price: "spreadHome", line: "spreadHomeLine", testId: "spread-home", role: "home", team: selected?.home },
  ]);
  const totalSides = [
    { price: "totalOver", testId: "total-over", role: "over" },
    { price: "totalUnder", testId: "total-under", role: "under" },
  ];
</script>

{#snippet oddsStepper(name: string, testId: string, role: string)}
  <span class="pc-stepper">
    <button type="button" aria-label="Lower the {role} odds by 5" onclick={() => step(name, -1)}>−</button>
    <input id={testId} {name} data-testid={testId} defaultValue={value(name)} inputmode="numeric" />
    <button type="button" aria-label="Raise the {role} odds by 5" onclick={() => step(name, 1)}>+</button>
  </span>
{/snippet}


<main class="pc-page pc-board-entry">
  <h1>{isRefresh ? "Refresh game board" : "Game board"}</h1>
  {#if isRefresh && selected}
    <p class="pc-hint" data-testid="refresh-note">
      New prices for {selected.away} at {selected.home}. The board you are refreshing stays exactly as it
      was, and this one links to it. You can change the sportsbook, lines, odds, and time, and add or drop markets.
    </p>
  {/if}
  {#if data.refreshError}
    <Alert data-testid="refresh-error">{data.refreshError}</Alert>
  {/if}
  <p class="pc-hint">
    Enter both sides of any of the moneyline, spread, and total exactly as your sportsbook lists them. Leave a market blank to skip it. The forecasting model
    names the side it prefers and grades it in code. A model pick is not a bet and not a research
    analysis.
  </p>
  {#if data.scheduleError}
    <Alert data-testid="schedule-error">{data.scheduleError}</Alert>
  {:else if data.games.length === 0}
    <Alert data-testid="schedule-error">No upcoming games in the schedule file. Run npm run data:schedule.</Alert>
  {/if}

  <form
    method="POST"
    action="?/freeze"
    class="pc-board-form"
    bind:this={formElement}
    onsubmit={(event) => {
      const element = event.currentTarget as HTMLFormElement;
      if (element.dataset.submitting === "true") {
        event.preventDefault();
        return;
      }
      element.dataset.submitting = "true";
      const button = element.querySelector<HTMLButtonElement>('[data-testid="freeze-board"]');
      if (button) {
        button.disabled = true;
        button.textContent = "Freezing…";
      }
    }}
  >
    <input type="hidden" name="requestId" value={value("requestId", data.requestId)} />
    <input type="hidden" name="parentId" value={value("parentId")} />
    <input
      type="hidden"
      name="scheduleRetrievedAt"
      value={value("scheduleRetrievedAt", data.scheduleRetrievedAt ?? "")}
    />

    {#if form?.error}
      <Alert data-testid="board-error">{form.error}</Alert>
    {/if}

    <section class="pc-section" aria-labelledby="board-game-title">
      <h2 id="board-game-title">Game</h2>
      {#if isRefresh && selected}
        <input type="hidden" name="gameId" value={selectedId} />
        <p data-testid="board-game-fixed">{selected.away} at {selected.home}, {selected.kickoffLabel}</p>
      {:else}
        <label class="pc-field">
          Game
          <select name="gameId" data-testid="board-game" bind:value={selectedId}>
            {#each data.games as game (game.id)}
              <option value={game.id}>Week {game.week}: {game.away} at {game.home}, {game.kickoffLabel}</option>
            {/each}
          </select>
        </label>
      {/if}
      {#if selected}
        <p class="pc-matchup-facts">
          <span>{selected.kickoffLabel}</span>
          <span>{selected.venue}</span>
        </p>
      {/if}
      <div class="pc-pair">
        <label class="pc-field">
          Sportsbook
          <input
            name="sportsbook"
            data-testid="board-sportsbook"
            defaultValue={value("sportsbook")}
            placeholder="e.g. FanDuel"
            required
          />
        </label>
        <label class="pc-field">
          When you saw these prices
          <input
            type="datetime-local"
            name="observedAt"
            data-testid="board-observed-at"
            defaultValue={value("observedAt", data.observedDefault)}
            required
          />
        </label>
      </div>
      {#if data.registrations.length > 0}
        <label class="pc-field">
          Prospective evaluation
          <select name="protocolRegistrationId" data-testid="board-protocol">
            <option value="">Do not include this board</option>
            {#each data.registrations as registration (registration.id)}
              <option value={registration.id} selected={value("protocolRegistrationId") === registration.id}>
                {registration.protocol.artifactChecksum.slice(0, 12)} registered {registration.registeredAt}
              </option>
            {/each}
          </select>
        </label>
        <p class="pc-hint">The selected evaluation must match the forecasting artifact. Only forecasts recorded after registration can be included.</p>
      {/if}
    </section>

    <section class="pc-section" aria-labelledby="board-moneyline-title">
      <h2 id="board-moneyline-title">Moneyline</h2>
      <p class="pc-hint">Both sides, so the two prices can be compared. American odds, such as −150 and +130.</p>
      <div class="pc-pair">
        {#each sides as side (side.name)}
          <div class="pc-field">
            <label for={side.testId}>{side.team ?? side.role} ({side.role})</label>
            {@render oddsStepper(side.name, side.testId, side.role)}
          </div>
        {/each}
      </div>
      <label class="pc-field">
        Moneyline tie rule
        <select name="tieRule" data-testid="board-tie-rule">
          {#each ["push", "loss", "win", "void"] as rule (rule)}
            <option value={rule} selected={value("tieRule", "push") === rule}>{rule}</option>
          {/each}
        </select>
      </label>
      <p class="pc-hint">A tie is not a win or a loss until the tie rule says so.</p>
    </section>

    <section class="pc-section" aria-labelledby="board-spread-title">
      <h2 id="board-spread-title">Spread</h2>
      <p class="pc-hint">
        Enter the home line once. The away line fills in as its mirror: home −3.5 pairs with away +3.5.
      </p>
      <div class="pc-pair">
        {#each spreadSides as side (side.price)}
          <div class="pc-field">
            <label for="{side.testId}-line">{side.team ?? side.role} ({side.role}) line</label>
            <span class="pc-stepper">
              <button type="button" aria-label="Lower the {side.role} spread line by half a point" onclick={() => { stepLine(side.line, -1, true); }}>−</button>
              <input
                id="{side.testId}-line"
                name={side.line}
                data-testid="{side.testId}-line"
                defaultValue={value(side.line)}
                inputmode="decimal"
                oninput={side.role === "home" ? mirrorSpread : undefined}
              />
              <button type="button" aria-label="Raise the {side.role} spread line by half a point" onclick={() => { stepLine(side.line, 1, true); }}>+</button>
            </span>
          </div>
        {/each}
      </div>
      <div class="pc-pair">
        {#each spreadSides as side (side.price)}
          <div class="pc-field">
            <label for={side.testId}>{side.team ?? side.role} ({side.role}) odds</label>
            {@render oddsStepper(side.price, side.testId, side.role)}
          </div>
        {/each}
      </div>
    </section>

    <section class="pc-section" aria-labelledby="board-total-title">
      <h2 id="board-total-title">Total</h2>
      <p class="pc-hint">One number shared by over and under, then the odds for each.</p>
      <div class="pc-field">
        <label for="total-line">Total</label>
        <span class="pc-stepper">
          <button type="button" aria-label="Lower the total by half a point" onclick={() => stepLine("totalLine", -1, false)}>−</button>
          <input id="total-line" name="totalLine" data-testid="total-line" defaultValue={value("totalLine")} inputmode="decimal" />
          <button type="button" aria-label="Raise the total by half a point" onclick={() => stepLine("totalLine", 1, false)}>+</button>
        </span>
      </div>
      <div class="pc-pair">
        {#each totalSides as side (side.price)}
          <div class="pc-field">
            <label for={side.testId}>{side.role[0].toUpperCase()}{side.role.slice(1)} odds</label>
            {@render oddsStepper(side.price, side.testId, side.role)}
          </div>
        {/each}
      </div>
    </section>

    <section class="pc-section" aria-labelledby="board-quotes-title">
      <h2 id="board-quotes-title">Other sportsbooks (optional)</h2>
      <p class="pc-hint">
        A price from another sportsbook for a side you already entered. The best price on the same line is
        marked and used for the model pick. A different line is listed as another contract, not a better price.
      </p>
      <div data-testid="quote-rows">
        {#each quoteRows as row, index (index)}
          <div class="pc-evidence-row" data-testid="quote-row">
            <label class="pc-field">
              Sportsbook
              <input name="quoteSportsbook" data-testid="quote-sportsbook" bind:value={row.sportsbook} />
            </label>
            <label class="pc-field">
              Market
              <select name="quoteMarket" data-testid="quote-market" bind:value={row.market}>
                <option value="moneyline">moneyline</option>
                <option value="spread">spread</option>
                <option value="total">total</option>
              </select>
            </label>
            <label class="pc-field">
              Side
              <select name="quoteSelection" data-testid="quote-selection" bind:value={row.selection}>
                <option value="home">home</option>
                <option value="away">away</option>
                <option value="over">over</option>
                <option value="under">under</option>
              </select>
            </label>
            <label class="pc-field">
              American odds
              <input name="quoteOdds" data-testid="quote-odds" bind:value={row.americanOdds} inputmode="numeric" />
            </label>
            <label class="pc-field">
              Point line, if this is a spread or total
              <input name="quoteLine" data-testid="quote-line" bind:value={row.pointLine} inputmode="decimal" />
            </label>
            <label class="pc-field">
              When you saw it
              <input name="quoteObservedAt" type="datetime-local" data-testid="quote-observed-at" bind:value={row.observedAt} />
            </label>
            <Button class="justify-self-start" onclick={() => (quoteRows = quoteRows.filter((_, item) => item !== index))}>
              Remove quote
            </Button>
          </div>
        {/each}
      </div>
      <Button class="justify-self-start" data-testid="add-quote" onclick={() => (quoteRows = [...quoteRows, blankQuote()])}>
        Add a quote
      </Button>
    </section>

    <section class="pc-section" aria-labelledby="board-evidence-title">
      <h2 id="board-evidence-title">Your evidence (optional)</h2>
      <fieldset class="pc-evidence" data-testid="manual-evidence">
        <legend class="sr-only">Your evidence (optional)</legend>
        <p class="pc-hint">
          A club injury report, a beat reporter's note, a forecast. A note stands in for a missing injury
          report only within 24 hours of the cutoff, and for a forecast within 12. Leave the time blank if
          the source does not say when it was published. Anything dated after now is excluded.
        </p>
        {#each manualRows as row, index (index)}
          <div class="pc-evidence-row">
            <label class="pc-field pc-wide">
              Note
              <textarea name="manualText" rows="2" data-testid="manual-text" defaultValue={row.text}></textarea>
            </label>
            <label class="pc-field">
              Link
              <input name="manualUrl" type="url" defaultValue={row.url} data-testid="manual-url" />
            </label>
            <label class="pc-field">
              Published
              <input name="manualTime" type="datetime-local" defaultValue={row.time} data-testid="manual-time" />
            </label>
            <label class="pc-field">
              Team, if this stands in for that team's injury report
              <input name="manualTeam" defaultValue={row.team ?? ""} maxlength="3" data-testid="manual-team" />
            </label>
            <label class="pc-field">
              Stands in for
              <select name="manualCovers" data-testid="manual-covers">
                <option value="" selected={!row.covers}>nothing (extra context)</option>
                <option value="injury-report" selected={row.covers === "injury-report"}>a missing injury report (last 24 hours)</option>
                <option value="weather" selected={row.covers === "weather"}>a missing kickoff forecast (last 12 hours)</option>
              </select>
            </label>
          </div>
        {/each}
        <Button class="justify-self-start" onclick={() => (manualRows = [...manualRows, blankRow()])}>Add another source</Button>
      </fieldset>
    </section>

    <section class="pc-section" aria-labelledby="board-lean-title">
      <h2 id="board-lean-title">Private lean (optional)</h2>
      <p class="pc-hint">Kept apart from the evidence and every model pick. The forecasting model never sees it.</p>
      <div class="pc-private">
        <label class="pc-field">
          Your lean
          <input name="lean" defaultValue={value("lean")} data-testid="lean" />
        </label>
        <label class="pc-field">
          Rationale
          <input name="rationale" defaultValue={value("rationale")} data-testid="rationale" />
        </label>
      </div>
    </section>

    <Button type="submit" size="lg" class="justify-self-start" data-testid="freeze-board" disabled={!selected}>
      {isRefresh ? "Freeze refreshed board" : "Freeze board"}
    </Button>
  </form>
</main>
