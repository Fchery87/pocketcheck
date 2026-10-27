# PocketCheck interface redesign map

Spec: [spec.md](spec.md)

## Notes

- The app is SvelteKit 3 and Svelte 5 with no styling, no Tailwind, and no component library.
- The browser acceptance suite uses test identifiers heavily and selects options on native selects.
- shadcn here means shadcn-svelte. The React shadcn/ui registry does not apply.
- No shadcn MCP tools were visible in the 2026-10-26 session.

## Decisions so far

- Stack: shadcn-svelte on Bits UI, Tailwind v4, Melt builders for the odds stepper, stage navigation, and theme switch.
- Prototypes: three throwaway HTML pages in `prototypes/`, published as private Artifacts, showing Analyze and the analysis report.
- Directions: A Archive ledger, B Broadcast telemetry, C Field almanac.
- Analyze: staged single page (Game, Offer, Your evidence, Private lean, Review) with a Research offer summary and a "Freeze & analyze" button.
- Honesty: no profit signalling. Gaps, unknowns, and unavailable values never look like zero.
- Theme: Light, Dark, System, stored in a cookie.
- Devices: Analyze phone-first, report and Journal desktop-first.
- Accessibility: WCAG 2.2 AA. Motion only for state changes, off under reduced motion.
- Fonts: self-hosted in the real build.
- Verification: keep every test identifier. `npm run verify` stays green.
- 2026-10-26: Direction C (Field almanac) approved after review fixes: ink stamp for frozen, quieter borders, compact phone header, readable small text. Rules recorded in `DESIGN.md`; component split in `docs/adr/0001-component-library-split.md`.

## Fog

- Whether the chosen direction's fonts are all available as Fontsource packages.
- Exact Journal layout, designed after the direction is chosen.
