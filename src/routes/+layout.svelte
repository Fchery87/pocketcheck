<script lang="ts">
  import type { LayoutProps } from "./$types";

  let { children }: LayoutProps = $props();
</script>

<nav>
  <a href="/">Analyze</a>
  <a href="/journal">Journal</a>
  <a href="/handbook">Handbook</a>
  <a href="/settings">Settings</a>
</nav>

{@render children()}
