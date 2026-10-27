<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.ts";
	import type { HTMLThAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLThAttributes> = $props();
</script>

<th bind:this={ref} data-slot="table-head" class={cn("h-10 py-2 pr-3 text-left align-top font-bold text-muted-foreground", className)} {...restProps}>
	{@render children?.()}
</th>
