# Component library split: shadcn-svelte, Bits UI, and Melt

PocketCheck is a SvelteKit app, so the React shadcn/ui registry does not apply. Standard components come from shadcn-svelte, which is built on Bits UI and copied into the repo as source. Bits UI is used directly only when shadcn-svelte has no component. Melt builders are used only for custom controls that shadcn-svelte does not cover: the theme switch (a radio group) and the Research offer bottom sheet (a collapsible). The odds and line stepper and the Analyze stage navigation are plain Svelte, because Melt has no builder that fits them and each is a few buttons and links. Each control has exactly one library owning its focus and keyboard behaviour, so two libraries never fight over the same element.

## Consequences

- Game, market, selection, tie rule, and evidence "stands in for" stay native `<select>` elements. They give the best phone pickers, work before scripts load, and keep the browser acceptance tests' option-based selection valid.
- Adding a fourth headless library, or using Melt for a control shadcn-svelte already covers, reopens this decision.
