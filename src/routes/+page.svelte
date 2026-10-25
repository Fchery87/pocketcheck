<script lang="ts">
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const selectedId = $derived(form?.gameId ?? data.games[0]?.id ?? "");
  const selected = $derived(data.games.find((game) => game.id === selectedId) ?? data.games[0]);
</script>

<main>
  <h1>Analyze</h1>
  <p data-testid="game-name">{data.gameName}</p>
  {#if form?.error}
    <p data-testid="form-error">{form.error}</p>
  {/if}
  {#if selected}
    <section data-testid="game-card">
      <p data-testid="game-date">{selected.dateLabel}</p>
      <p data-testid="kickoff">{selected.kickoffLabel}</p>
      <p data-testid="timezone">America/New_York</p>
      <p data-testid="venue">{selected.venue}</p>
      <p data-testid="away">{selected.away}</p>
      <p data-testid="home">{selected.home}</p>
      {#if selected.started}
        <p data-testid="started">This game has already started.</p>
      {/if}
    </section>
  {/if}

  <form method="POST" action="?/analyze">
    <label>
      Game
      <select name="gameId" data-testid="game-id">
        {#each data.games as game (game.id)}
          <option value={game.id} selected={game.id === selectedId} disabled={game.started}>
            {game.away} at {game.home}
          </option>
        {/each}
      </select>
    </label>
    <label>
      Sportsbook
      <input name="sportsbook" value="Fixture Book" required />
    </label>
    <label>
      Market
      <select name="market">
        <option value="moneyline">moneyline</option>
        <option value="spread">spread</option>
        <option value="total">total</option>
      </select>
    </label>
    <label>
      Selection
      <select name="selection">
        <option value="home">home</option>
        <option value="away">away</option>
        <option value="over">over</option>
        <option value="under">under</option>
      </select>
    </label>
    <label>
      Line
      <input name="pointLine" />
    </label>
    <label>
      American odds
      <input name="americanOdds" value="-110" required data-testid="american-odds" />
    </label>
    <label>
      Observed time
      <input name="observedAt" value="2026-10-20T16:00:00.000Z" required data-testid="observed-at" />
    </label>
    <label>
      Tie rule
      <select name="tieRule">
        <option value="push">push</option>
        <option value="loss">loss</option>
        <option value="win">win</option>
        <option value="void">void</option>
      </select>
    </label>
    <label>
      Lean
      <input name="lean" data-testid="lean" />
    </label>
    <label>
      Rationale
      <input name="rationale" />
    </label>
    <input type="hidden" name="parentId" value={form?.parentId ?? ""} />
    <button type="submit" data-testid="analyze">Analyze</button>
  </form>

  {#if form?.stages}
    <ol data-testid="progress">
      {#each form.stages as stage (stage)}
        <li>{stage}</li>
      {/each}
    </ol>
  {/if}
</main>
