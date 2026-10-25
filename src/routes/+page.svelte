<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const gameName = $derived(form?.gameName ?? data.gameName);
</script>

<main>
	<h1>PocketCheck</h1>
	<p>Research journal toolchain check. No model or live data is connected.</p>
	<p data-testid="game-name">{gameName}</p>
	<form method="POST">
		<button type="submit">Load fixture game</button>
	</form>
</main>
