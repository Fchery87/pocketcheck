<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";
  import type { PageProps } from "./$types";
  let { form }: PageProps = $props();
</script>

<svelte:head><title>Sign in · PocketCheck</title></svelte:head>
<main class="pc-page">
  <h1>Sign in to your journal</h1>
  <p>Enter the access secret configured on the PocketCheck server.</p>
  <p>Use HTTPS outside a trusted network. Plain HTTP does not keep your secret or session private.</p>
  <form method="POST" class="pc-form pc-section">
    <label for="secret">Access secret</label>
    <input id="secret" name="secret" type="password" autocomplete="current-password" required maxlength="1024" />
    {#if form?.message}<p role="alert">{form.message}</p>{/if}
    <Button type="submit">Sign in</Button>
  </form>
</main>
