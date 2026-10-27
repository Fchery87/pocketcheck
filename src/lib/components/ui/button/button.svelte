<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";
	import { cn, type WithElementRef } from "#lib/utils.ts";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";

	export const buttonVariants = tv({
		// PocketCheck: square, at least 44px tall, and only the primary action carries the hard shadow (DESIGN.md).
		base: "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-bold outline-none transition-[transform,box-shadow,background-color,color] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground font-display font-extrabold [font-stretch:120%] shadow-[6px_6px_0_var(--ink)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[4px_4px_0_var(--ink)] active:translate-x-1.5 active:translate-y-1.5 active:shadow-none",
				outline: "border border-input bg-card text-foreground hover:bg-foreground hover:text-background",
				link: "text-foreground underline decoration-primary decoration-2 underline-offset-4 hover:text-primary",
			},
			size: {
				default: "min-h-11 px-4 py-2 text-sm",
				lg: "min-h-[60px] px-[30px] text-xl",
				icon: "size-11 text-xl",
			},
		},
		defaultVariants: {
			variant: "outline",
			size: "default",
		},
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
	export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = "outline",
		size = "default",
		ref = $bindable(null),
		href = undefined,
		type = "button",
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? "link" : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
