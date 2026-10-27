<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";

	export const badgeVariants = tv({
		// PocketCheck record-state tags: a mark and a word, never colour alone (DESIGN.md).
		base: "inline-flex w-fit max-w-full items-center gap-1.5 border px-2.5 py-0.5 text-sm font-bold",
		variants: {
			variant: {
				default: "border-input bg-card text-foreground",
				dashed: "border-dashed border-input bg-card font-semibold text-muted-foreground",
				gap: "border-transparent bg-hl text-hl-ink",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	});

	export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from "#lib/utils.ts";
	import type { HTMLAnchorAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		href,
		class: className,
		variant = "default",
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & {
		variant?: BadgeVariant;
	} = $props();
</script>

<svelte:element
	this={href ? "a" : "span"}
	bind:this={ref}
	data-slot="badge"
	{href}
	class={cn(badgeVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</svelte:element>
