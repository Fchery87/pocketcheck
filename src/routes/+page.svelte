<script lang="ts">
  import { Alert } from "#lib/components/ui/alert/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { onMount } from "svelte";
  import { Collapsible } from "melt/builders";
  import type { PageProps } from "./$types";

  import { americanToDecimal, breakEven } from "#lib/domain/odds.ts";
  import { offerEntryGuidance, type Market } from "#lib/domain/offer.ts";
  import { stepAmericanOdds, stepPointLine, type StepDirection } from "#lib/domain/stepper.ts";
  import { percent, signedLine } from "#lib/format.ts";

  let { data, form }: PageProps = $props();
  let selectedId = $derived(form?.values?.gameId || data.games[0]?.id || "");
  const selected = $derived(data.games.find((game) => game.id === selectedId) ?? data.games[0]);
  const value = (name: string, fallback = "") =>
    (form?.values as Record<string, string> | undefined)?.[name] ?? fallback;
  let market = $state<Market>("moneyline");
  $effect(() => {
    const entered = value("market", "moneyline");
    if (entered === "moneyline" || entered === "spread" || entered === "total") market = entered;
  });
  const guidance = $derived(offerEntryGuidance(market));
  const blankRow = () => ({ text: "", url: "", time: "", covers: "", team: "" });
  let manualRows = $derived(form?.manual?.length ? form.manual : [blankRow()]);

  // What the user has typed so far. Before hydration it falls back to the server's values.
  let formElement: HTMLFormElement | undefined = $state();
  let entered = $state<Record<string, string>>({});
  const field = (name: string, fallback = "") => entered[name] ?? value(name, fallback);
  const readForm = () => {
    if (!formElement) return;
    const next: Record<string, string> = {};
    for (const [name, item] of new FormData(formElement)) {
      if (typeof item === "string" && !(name in next)) next[name] = item;
    }
    next.manualText = [...formElement.querySelectorAll<HTMLTextAreaElement>('[name="manualText"]')]
      .map((area) => area.value.trim())
      .join("");
    entered = next;
  };

  const parseOdds = (text: string) => {
    const odds = Number(text.trim().replace("−", "-"));
    return text.trim() !== "" && Number.isInteger(odds) && Math.abs(odds) >= 100 ? odds : null;
  };
  const parseLine = (text: string) => {
    const line = Number(text.trim().replace("−", "-"));
    return text.trim() !== "" && Number.isFinite(line) ? line : null;
  };

  const odds = $derived(parseOdds(field("americanOdds", "-110")));
  const line = $derived(parseLine(field("pointLine")));
  const lineOk = $derived(!guidance.line || line !== null);
  const implied = $derived.by(() => {
    if (odds === null) return null;
    try {
      return breakEven(americanToDecimal(odds)).decisive;
    } catch {
      return null;
    }
  });
  const bookEntered = $derived(field("sportsbook").trim() !== "");
  const offerComplete = $derived(bookEntered && odds !== null && lineOk && field("observedAt", data.observedDefault) !== "");

  type StageState = "empty" | "progress" | "complete" | "optional" | "attention" | "ready";
  const stageWords: Record<StageState, string> = {
    empty: "○ Not started",
    progress: "◐ In progress",
    complete: "● Complete",
    optional: "◌ Optional",
    attention: "▲ Needs attention",
    ready: "● Ready to freeze",
  };
  let offerAttention = $state(false);
  $effect(() => {
    if (form?.error) offerAttention = true;
  });
  const stages = $derived<{ id: string; name: string; state: StageState }[]>([
    { id: "game", name: "Game", state: selected ? "complete" : "attention" },
    {
      id: "offer",
      name: "Offer",
      state: offerAttention ? "attention" : offerComplete ? "complete" : "progress",
    },
    { id: "evidence", name: "Your evidence", state: field("manualText") ? "complete" : "optional" },
    { id: "lean", name: "Private lean", state: field("lean").trim() ? "complete" : "optional" },
    { id: "review", name: "Review", state: offerComplete && selected ? "ready" : "empty" },
  ]);
  const stageState = (id: string) => stages.find((stage) => stage.id === id)?.state ?? "empty";

  let currentStage = $state("game");
  const goToStage = (id: string) => {
    const section = document.getElementById(`stage-${id}`);
    if (!section) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    section.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  };

  const step = (name: "americanOdds" | "pointLine", direction: StepDirection) => {
    const input = formElement?.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (!input) return;
    const next =
      name === "americanOdds"
        ? stepAmericanOdds(parseOdds(input.value), direction)
        : stepPointLine(parseLine(input.value), direction);
    input.value = name === "americanOdds" && next > 0 ? `+${next}` : String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const offerSheet = new Collapsible();

  onMount(() => {
    readForm();
    if (form?.error) {
      document.getElementById("stage-offer")?.scrollIntoView({ block: "start" });
      document.querySelector<HTMLElement>("#stage-offer h2")?.focus({ preventScroll: true });
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) currentStage = entry.target.id.replace("stage-", "");
        }
      },
      { rootMargin: "-35% 0px -60% 0px" },
    );
    document.querySelectorAll("[data-stage]").forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  });
</script>

<main class="pc-analyze">
  <h1 class="pc-kicker">New analysis</h1>
  {#if data.scheduleError}
    <Alert data-testid="schedule-error">{data.scheduleError}</Alert>
  {:else if data.games.length === 0}
    <Alert data-testid="schedule-error">No upcoming games in the schedule file. Run npm run data:schedule.</Alert>
  {/if}

  <nav class="pc-stages" aria-label="Analysis stages">
    <ol>
      {#each stages as stage, index (stage.id)}
        <li>
          <button
            type="button"
            data-state={stage.state}
            aria-current={currentStage === stage.id ? "step" : undefined}
            onclick={() => goToStage(stage.id)}
          >
            <span class="pc-stage-number">{index + 1}</span>
            <span class="pc-stage-name">{stage.name}</span>
            <span class="pc-stage-state">{stageWords[stage.state]}</span>
          </button>
        </li>
      {/each}
    </ol>
  </nav>

  <div class="pc-analyze-grid">
    <form
      method="POST"
      action="?/analyze"
      class="pc-stage-form"
      bind:this={formElement}
      oninput={(event) => {
        if ((event.target as HTMLElement).closest("#stage-offer")) offerAttention = false;
        readForm();
      }}
      onchange={readForm}
      onsubmit={(event) => {
        const form = event.currentTarget as HTMLFormElement;
        if (form.dataset.submitting === "true") {
          event.preventDefault();
          return;
        }
        form.dataset.submitting = "true";
        try {
          sessionStorage.setItem("pocketcheck-just-frozen", "1");
        } catch {
          // Storage can be unavailable; the stamp then appears without its motion.
        }
        const button = form.querySelector<HTMLButtonElement>('[data-testid="analyze"]');
        if (button) {
          button.disabled = true;
          button.textContent = "Freezing…";
        }
        form.querySelector<HTMLElement>('[data-testid="submission-pending"]')?.removeAttribute("hidden");
      }}
    >
      <input type="hidden" name="requestId" value={value("requestId", data.requestId)} />
      <input type="hidden" name="cutoffAt" value={value("cutoffAt", data.cutoffAt)} />
      <input
        type="hidden"
        name="scheduleRetrievedAt"
        value={value("scheduleRetrievedAt", data.scheduleRetrievedAt ?? "")}
      />

      <section class="pc-stage" id="stage-game" data-stage data-state={stageState("game")} aria-labelledby="stage-game-title">
        <span class="pc-numeral" aria-hidden="true">1</span>
        <div class="pc-stage-main">
          <h2 id="stage-game-title" tabindex="-1">Game</h2>
          <label class="pc-field">
            Game
            <select name="gameId" data-testid="game-id" bind:value={selectedId}>
              {#each data.games as game (game.id)}
                <option value={game.id}>Week {game.week}: {game.away} at {game.home}, {game.kickoffLabel}</option>
              {/each}
            </select>
          </label>
          {#if selected}
            <section class="pc-matchup" data-testid="game-card" aria-label="Selected game">
              <p class="pc-matchup-teams">
                <span data-testid="away">{selected.away}</span>
                <i>at</i>
                <span data-testid="home">{selected.home}</span>
              </p>
              <p class="pc-matchup-facts">
                <span data-testid="kickoff">{selected.kickoffLabel}</span>
                <span class="pc-figure" data-testid="timezone">America/New_York</span>
                <span data-testid="venue">{selected.venue}</span>
              </p>
            </section>
          {/if}
          <p class="pc-hint">Only games that have not kicked off are listed.</p>
        </div>
      </section>

      <section class="pc-stage" id="stage-offer" data-stage data-state={stageState("offer")} aria-labelledby="stage-offer-title">
        <span class="pc-numeral" aria-hidden="true">2</span>
        <div class="pc-stage-main">
          <h2 id="stage-offer-title" tabindex="-1">Offer</h2>
          <p class="pc-hint">The exact price you are researching, as the sportsbook showed it.</p>
          {#if form?.error}
            <Alert data-testid="form-error">{form.error}</Alert>
          {/if}
          <div class="pc-pair">
            <label class="pc-field">
              Sportsbook
              <input name="sportsbook" defaultValue={value("sportsbook")} placeholder="e.g. FanDuel" required />
            </label>
            <label class="pc-field">
              Market
              <select name="market" data-testid="market" bind:value={market}>
                <option value="moneyline">moneyline</option>
                <option value="spread">spread</option>
                <option value="total">total</option>
              </select>
            </label>
          </div>
          <p class="pc-hint" data-testid="market-guidance">{guidance.explanation}</p>
          <div class="pc-pair">
            <label class="pc-field">
              Selection
              <select name="selection" data-testid="selection">
                {#each guidance.selections as option (option)}
                  <option value={option} selected={option === value("selection", guidance.selections[0])}>{option}</option>
                {/each}
              </select>
            </label>
            {#if guidance.line}
              <div class="pc-field">
                <label for="point-line">{market === "spread" ? "Selected-side line" : "Total line"}</label>
                <span class="pc-stepper">
                  <button type="button" aria-label="Lower the line by half a point" onclick={() => step("pointLine", -1)}>−</button>
                  <input
                    id="point-line"
                    name="pointLine"
                    data-testid="point-line"
                    defaultValue={value("pointLine")}
                    inputmode="decimal"
                    required
                  />
                  <button type="button" aria-label="Raise the line by half a point" onclick={() => step("pointLine", 1)}>+</button>
                </span>
              </div>
            {:else}
              <input type="hidden" name="pointLine" value="" />
            {/if}
          </div>
          {#if guidance.line}
            <p class="pc-hint" data-testid="line-guidance">{guidance.line}</p>
          {/if}
          <div class="pc-pair">
            <div class="pc-field">
              <label for="american-odds">American odds</label>
              <span class="pc-stepper">
                <button type="button" aria-label="Lower the odds by 5" onclick={() => step("americanOdds", -1)}>−</button>
                <input
                  id="american-odds"
                  name="americanOdds"
                  defaultValue={value("americanOdds", "-110")}
                  required
                  inputmode="numeric"
                  data-testid="american-odds"
                />
                <button type="button" aria-label="Raise the odds by 5" onclick={() => step("americanOdds", 1)}>+</button>
              </span>
            </div>
            <label class="pc-field">
              When you saw this price
              <input
                type="datetime-local"
                name="observedAt"
                defaultValue={value("observedAt", data.observedDefault)}
                required
                data-testid="observed-at"
              />
            </label>
          </div>
          {#if guidance.tieRule}
            <label class="pc-field">
              Moneyline tie rule
              <select name="tieRule" data-testid="tie-rule">
                <option value="push" selected={value("tieRule", "push") === "push"}>push</option>
                <option value="loss" selected={value("tieRule", "push") === "loss"}>loss</option>
                <option value="win" selected={value("tieRule", "push") === "win"}>win</option>
                <option value="void" selected={value("tieRule", "push") === "void"}>void</option>
              </select>
            </label>
            <p class="pc-hint" data-testid="tie-guidance">{guidance.tieRule}</p>
          {:else}
            <input type="hidden" name="tieRule" value="" />
          {/if}
        </div>
      </section>

      <section class="pc-stage" id="stage-evidence" data-stage data-state={stageState("evidence")} aria-labelledby="stage-evidence-title">
        <span class="pc-numeral" aria-hidden="true">3</span>
        <div class="pc-stage-main">
          <h2 id="stage-evidence-title" tabindex="-1">Your evidence</h2>
          <fieldset class="pc-evidence" data-testid="manual-evidence">
            <legend class="sr-only">Your evidence (optional)</legend>
            <p class="pc-hint">
              A club injury report, a beat reporter's note, a forecast. A note stands in for a missing injury
              report only within 24 hours of the cutoff, and for a forecast within 12. Leave the time blank if
              the source does not say when it was published. Anything dated after now is excluded from this
              report.
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
        </div>
      </section>

      <section class="pc-stage" id="stage-lean" data-stage data-state={stageState("lean")} aria-labelledby="stage-lean-title">
        <span class="pc-numeral" aria-hidden="true">4</span>
        <div class="pc-stage-main">
          <h2 id="stage-lean-title" tabindex="-1">Private lean</h2>
          <p class="pc-hint">Kept apart from the evidence and the thesis until the report exists. The model never sees it.</p>
          <div class="pc-private">
            <label class="pc-field">
              Your lean (kept private until the report exists)
              <input name="lean" defaultValue={value("lean")} data-testid="lean" />
            </label>
            <label class="pc-field">
              Rationale
              <input name="rationale" defaultValue={value("rationale")} data-testid="rationale" />
            </label>
          </div>
        </div>
      </section>

      <section class="pc-stage" id="stage-review" data-stage data-state={stageState("review")} aria-labelledby="stage-review-title">
        <span class="pc-numeral" aria-hidden="true">5</span>
        <div class="pc-stage-main">
          <h2 id="stage-review-title" tabindex="-1">Review</h2>
          <p class="pc-hint">
            Freezing writes one permanent analysis. A later price for this market and side becomes a refresh
            linked to it, not an edit.
          </p>
          <ul class="pc-freeze-list">
            <li>The game as scheduled now</li>
            <li>The research offer</li>
            <li>The decision cutoff</li>
            <li>Every evidence item and gap</li>
            <li>The model's identity</li>
            <li>The policy result</li>
          </ul>
          <p role="status" data-testid="submission-pending" hidden>Freezing your analysis…</p>
          <Button type="submit" variant="default" size="lg" class="justify-self-start" data-testid="analyze" disabled={!selected}>
            Freeze &amp; analyze
          </Button>
        </div>
      </section>
    </form>

    <aside class="pc-offer" aria-labelledby="research-offer-title" data-state={offerSheet.open ? "open" : "closed"}>
      <div class="pc-offer-head">
        <h2 id="research-offer-title">Research offer</h2>
        <Button class="pc-offer-toggle" {...offerSheet.trigger}>
          {offerSheet.open ? "Hide" : "Details"}
        </Button>
      </div>
      <p class="pc-offer-compact">
        <span class="pc-offer-big">
          {field("selection", guidance.selections[0])}{guidance.line ? ` ${line === null ? "—" : market === "spread" ? signedLine(line) : line}` : ""}
        </span>
        <span class="pc-figure pc-offer-odds">{odds === null ? "—" : odds > 0 ? `+${odds}` : odds}</span>
        <span class="pc-figure pc-offer-implied">break-even {implied === null ? "—" : percent(implied)}</span>
      </p>
      <div class="pc-offer-detail" {...offerSheet.content}>
        <dl>
          <dt>Game</dt>
          <dd>{selected ? `${selected.away} at ${selected.home}` : "—"}</dd>
          <dt>Market</dt>
          <dd>{market}</dd>
          <dt>Tie rule</dt>
          <dd>{guidance.tieRule ? field("tieRule", "push") : "not applicable"}</dd>
          <dt>Book</dt>
          <dd>{field("sportsbook").trim() || "—"}</dd>
          <dt>Seen</dt>
          <dd>{field("observedAt", data.observedDefault).replace("T", " ") || "—"}</dd>
        </dl>
        <p class="pc-hint">Break-even is the win rate this price needs, excluding pushes and including the book's margin.</p>
      </div>
    </aside>
  </div>
</main>
