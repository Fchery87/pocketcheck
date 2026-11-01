<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";
</script>
<svelte:head><title>Sign out · PocketCheck</title></svelte:head>
<main class="pc-page">
  <h1>Sign out of your journal</h1>
  <p>This removes the session from this browser.</p>
  <form method="POST"><Button type="submit">Sign out</Button></form>
</main>
