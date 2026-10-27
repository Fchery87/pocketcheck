<script lang="ts">
  import "../app.css";
  import "@fontsource-variable/anybody/standard.css";
  import "@fontsource-variable/atkinson-hyperlegible-next/index.css";
  import "@fontsource-variable/martian-mono/index.css";
  import { page } from "$app/state";
  import ThemeSwitch from "#lib/components/app/theme-switch.svelte";
  import type { LayoutProps } from "./$types";

  let { data, children }: LayoutProps = $props();

  const links = [
    { href: "/", label: "Analyze" },
    { href: "/board", label: "Game board" },
    { href: "/journal", label: "Journal" },
    { href: "/handbook", label: "Handbook" },
    { href: "/settings", label: "Settings" },
  ];
  const current = (href: string) => {
    const path = page.url.pathname;
    if (href === "/") return path === "/";
    if (href === "/journal") return path.startsWith("/journal") || path.startsWith("/analysis");
    return path.startsWith(href);
  };
</script>

<div class="pc-shell">
  <header class="pc-top">
    <a class="pc-brand" href="/">PocketCheck<small>field almanac</small></a>
    <nav class="pc-nav" aria-label="Primary">
      {#each links as link (link.href)}
        <a href={link.href} aria-current={current(link.href) ? "page" : undefined}>{link.label}</a>
      {/each}
    </nav>
    <ThemeSwitch theme={data.theme} />
  </header>

  {@render children()}
</div>
