<script lang="ts">
  import { RadioGroup } from "melt/builders";
  import { THEME_COOKIE, THEMES, type Theme } from "#lib/theme.ts";

  let { theme }: { theme: Theme } = $props();

  const labels: Record<Theme, string> = { light: "Light", dark: "Dark", system: "System" };

  function apply(value: string) {
    const next = THEMES.find((option) => option === value) ?? "system";
    if (next === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  const group = new RadioGroup({
    value: () => theme,
    orientation: "horizontal",
    onValueChange: apply,
  });
</script>

<div class="pc-theme" {...group.root} data-testid="theme-switch">
  <label class="sr-only" {...group.label}>Theme</label>
  {#each THEMES as option (option)}
    <button type="button" {...group.getItem(option).attrs}>{labels[option]}</button>
  {/each}
</div>
