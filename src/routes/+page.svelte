<script lang="ts">
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  let selectedId = $derived(form?.values?.gameId || data.games[0]?.id || "");
  const selected = $derived(data.games.find((game) => game.id === selectedId) ?? data.games[0]);
  const value = (name: string, fallback = "") =>
    (form?.values as Record<string, string> | undefined)?.[name] ?? fallback;
  const blankRow = () => ({ text: "", url: "", time: "", covers: "" });
  let manualRows = $derived(form?.manual?.length ? form.manual : [blankRow()]);
</script>

<main>
  <h1>Analyze</h1>
  {#if data.scheduleError}
    <p data-testid="schedule-error">{data.scheduleError}</p>
  {:else if data.games.length === 0}
    <p data-testid="schedule-error">No upcoming games in the schedule file. Run npm run data:schedule.</p>
  {/if}
  {#if form?.error}
    <p data-testid="form-error">{form.error}</p>
  {/if}
  {#if selected}
    <section data-testid="game-card">
      <p data-testid="kickoff">{selected.kickoffLabel}</p>
      <p data-testid="timezone">America/New_York</p>
      <p data-testid="venue">{selected.venue}</p>
      <p data-testid="away">{selected.away}</p>
      <p data-testid="home">{selected.home}</p>
    </section>
  {/if}

  <form method="POST" action="?/analyze">
    <label>
      Game
      <select name="gameId" data-testid="game-id" bind:value={selectedId}>
        {#each data.games as game (game.id)}
          <option value={game.id}>Week {game.week}: {game.away} at {game.home}, {game.kickoffLabel}</option>
        {/each}
      </select>
    </label>
    <label>
      Sportsbook
      <input name="sportsbook" value={value("sportsbook")} required />
    </label>
    <label>
      Market
      <select name="market" value={value("market", "moneyline")}>
        <option value="moneyline">moneyline</option>
        <option value="spread">spread</option>
        <option value="total">total</option>
      </select>
    </label>
    <label>
      Selection
      <select name="selection" value={value("selection", "home")}>
        <option value="home">home</option>
        <option value="away">away</option>
        <option value="over">over</option>
        <option value="under">under</option>
      </select>
    </label>
    <label>
      Line (selected side, spread or total only)
      <input name="pointLine" value={value("pointLine")} inputmode="decimal" />
    </label>
    <label>
      American odds
      <input name="americanOdds" value={value("americanOdds", "-110")} required data-testid="american-odds" />
    </label>
    <label>
      When you saw this price
      <input
        type="datetime-local"
        name="observedAt"
        value={value("observedAt", data.observedDefault)}
        required
        data-testid="observed-at"
      />
    </label>
    <label>
      Moneyline tie rule
      <select name="tieRule" value={value("tieRule", "push")}>
        <option value="push">push</option>
        <option value="loss">loss</option>
        <option value="win">win</option>
        <option value="void">void</option>
      </select>
    </label>
    <fieldset data-testid="manual-evidence">
      <legend>Your evidence (optional)</legend>
      <p>
        A club injury report, a beat reporter's note, a forecast. Leave the time blank if the source
        does not say when it was published. Anything dated after now is excluded from this report.
      </p>
      {#each manualRows as row, index (index)}
        <div>
          <label>
            Note
            <textarea name="manualText" rows="2" data-testid="manual-text">{row.text}</textarea>
          </label>
          <label>
            Link
            <input name="manualUrl" type="url" value={row.url} data-testid="manual-url" />
          </label>
          <label>
            Published
            <input name="manualTime" type="datetime-local" value={row.time} data-testid="manual-time" />
          </label>
          <label>
            Stands in for
            <select name="manualCovers" value={row.covers ?? ""} data-testid="manual-covers">
              <option value="">nothing (extra context)</option>
              <option value="injury-report">a missing injury report (last 24 hours)</option>
              <option value="weather">a missing kickoff forecast (last 12 hours)</option>
            </select>
          </label>
        </div>
      {/each}
      <button type="button" onclick={() => (manualRows = [...manualRows, blankRow()])}>
        Add another
      </button>
    </fieldset>
    <label>
      Your lean (kept private until the report exists)
      <input name="lean" value={value("lean")} data-testid="lean" />
    </label>
    <label>
      Rationale
      <input name="rationale" value={value("rationale")} data-testid="rationale" />
    </label>
    <button type="submit" data-testid="analyze" disabled={!selected}>Analyze</button>
  </form>
</main>
