<script lang="ts">
  import { Alert } from "#lib/components/ui/alert/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { stepAmericanOdds, type StepDirection } from "#lib/domain/stepper.ts";
  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const value = (name: string, fallback = "") =>
    (form?.values as Record<string, string> | undefined)?.[name] ?? fallback;
  let selectedId = $derived(form?.values?.gameId || data.games[0]?.id || "");
  const selected = $derived(data.games.find((game) => game.id === selectedId) ?? data.games[0]);
  let formElement: HTMLFormElement | undefined = $state();

  const parseOdds = (text: string) => {
    const odds = Number(text.trim().replace("−", "-"));
    return text.trim() !== "" && Number.isInteger(odds) && Math.abs(odds) >= 100 ? odds : null;
  };

  const step = (name: "moneylineHome" | "moneylineAway", direction: StepDirection) => {
    const input = formElement?.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (!input) return;
    const next = stepAmericanOdds(parseOdds(input.value), direction);
    input.value = next > 0 ? `+${next}` : String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const sides = $derived([
    { name: "moneylineAway" as const, testId: "moneyline-away", role: "away", team: selected?.away },
    { name: "moneylineHome" as const, testId: "moneyline-home", role: "home", team: selected?.home },
  ]);
</script>

<main class="pc-page pc-board-entry">
  <h1>Game board</h1>
  <p class="pc-hint">
    Enter both sides of the moneyline exactly as your sportsbook lists them. The forecasting model
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
    <input type="hidden" name="cutoffAt" value={value("cutoffAt", data.cutoffAt)} />
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
      <label class="pc-field">
        Game
        <select name="gameId" data-testid="board-game" bind:value={selectedId}>
          {#each data.games as game (game.id)}
            <option value={game.id}>Week {game.week}: {game.away} at {game.home}, {game.kickoffLabel}</option>
          {/each}
        </select>
      </label>
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
    </section>

    <section class="pc-section" aria-labelledby="board-moneyline-title">
      <h2 id="board-moneyline-title">Moneyline</h2>
      <p class="pc-hint">Both sides, so the two prices can be compared. American odds, such as −150 and +130.</p>
      <div class="pc-pair">
        {#each sides as side (side.name)}
          <div class="pc-field">
            <label for={side.testId}>{side.team ?? side.role} ({side.role})</label>
            <span class="pc-stepper">
              <button type="button" aria-label="Lower the {side.role} odds by 5" onclick={() => step(side.name, -1)}>−</button>
              <input
                id={side.testId}
                name={side.name}
                data-testid={side.testId}
                defaultValue={value(side.name)}
                inputmode="numeric"
              />
              <button type="button" aria-label="Raise the {side.role} odds by 5" onclick={() => step(side.name, 1)}>+</button>
            </span>
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

    <Button type="submit" size="lg" class="justify-self-start" data-testid="freeze-board" disabled={!selected}>
      Freeze board
    </Button>
  </form>
</main>
