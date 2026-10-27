<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";

	export const alertVariants = tv({
		// PocketCheck: an alert is a highlighter note. It always names what is wrong in words.
		base: "grid w-full max-w-[72ch] gap-1 px-4 py-3 text-left font-bold",
		variants: {
			variant: {
				default: "bg-hl text-hl-ink before:content-['▲_']",
				note: "border-l-3 border-hl bg-card font-normal text-foreground",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	});

	export type AlertVariant = VariantProps<typeof alertVariants>["variant"];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.ts";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		variant = "default",
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		variant?: AlertVariant;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="alert"
	role="alert"
	class={cn(alertVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</div>
