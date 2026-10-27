# PocketCheck interface redesign

Status: ready-for-agent
Type: task
Decisions agreed with the user in a grilling session on 2026-10-26. Test seams proposed below; the user approved writing the spec on 2026-10-26.

## Problem Statement

PocketCheck works, but it has no visual design at all. Every page is unstyled browser HTML. Analyze is one long form with eleven kinds of fields and no sense of order, so it is hard to tell what the research offer is, what is optional, and what becomes permanent when the analysis is saved. The analysis report shows frozen records, evidence gaps, unknown cost, and an experimental model as plain paragraphs with equal weight, so the distinctions the journal exists to protect (frozen versus live, sourced versus missing, unknown versus zero) are not visible. The app is awkward on a phone, which is where the user usually sees the price they want to research. There is no light or dark theme.

## Solution

A designed interface built with shadcn-svelte on Bits UI, Tailwind v4, and Melt builders for a few custom controls. The user first chooses one of three visual directions from throwaway prototypes, then that direction is applied to every route.

Analyze becomes a staged single-page flow: Game, Offer, Your evidence, Private lean, Review. A Research offer summary stays visible as a pinned side panel on desktop and a bottom sheet on a phone. The final step says exactly what freezes and that a later price becomes a refresh. The button reads "Freeze & analyze".

The analysis report leads with its frozen status and provenance, then the research offer and price mathematics, the policy result, evidence and gaps, the experimental model's status, and provider usage. Gaps, unknown values, and unavailable results each have a distinct visual treatment with an icon and a word, never a zero.

A Light, Dark, and System theme switch is stored in a cookie so the server renders the chosen theme without a flash.

## User Stories

1. As the user, I want to choose between three distinct visual directions before anything is built, so that the final design is one I picked rather than a default.
2. As the user, I want to open each prototype on my phone, so that I can judge the mobile layout in the hand.
3. As the user, I want each prototype to show Analyze and the analysis report with realistic data, so that I judge the design on the screens that define the product.
4. As the user, I want the interface to avoid recognisable AI-generated design patterns, so that the app feels like its own product.
5. As the user, I want to switch between Light, Dark, and System themes, so that the app suits the room I am in.
6. As the user, I want my theme choice remembered and applied before the page paints, so that the screen never flashes the wrong theme.
7. As the user, I want System to follow my device setting, so that I do not have to choose when I do not care.
8. As the user, I want Analyze laid out as ordered stages, so that I know where I am and what remains.
9. As the user, I want a stage rail that shows each stage as not started, in progress, complete, or needing attention, so that I can see the state of my entry at a glance.
10. As the user, I want to jump to any stage from the rail, so that I can correct an earlier field without scrolling hunts.
11. As the user, I want every field to stay on the page while I move between stages, so that nothing I typed is hidden or lost.
12. As the user, I want the Game stage to show kickoff, time zone, venue, and both teams as a clear matchup, so that I confirm I picked the right game.
13. As the user, I want games that have started to be unavailable, so that I cannot research a game after kickoff.
14. As the user, I want the Offer stage to change its fields with the market, so that a moneyline asks for a tie rule, a spread asks for the selected side's line, and a total asks for one shared line.
15. As the user, I want the market guidance written next to the fields, so that I understand that home −3.5 and away +3.5 are different offers.
16. As the user, I want an odds control that steps in 5-cent increments and skips the impossible range between −100 and +100, so that I can adjust a price quickly on a phone.
17. As the user, I want to type odds directly as well, so that the stepper never slows me down.
18. As the user, I want the time I saw the price prefilled with now and easy to change, so that the observation time is right without effort.
19. As the user, I want the Research offer summary to update as I type, so that I always see the exact offer being researched.
20. As the user on a desktop, I want that summary pinned beside the form, so that it stays in view.
21. As the user on a phone, I want that summary as a compact bottom bar that expands into a sheet, so that it does not take the whole screen.
22. As the user, I want the summary labelled Research offer and never called a contract or bet, so that I do not confuse the analysis with a placed bet.
23. As the user, I want the summary to show implied probability next to the odds, so that I see the break-even price while I enter it.
24. As the user, I want the Your evidence stage to explain what a manual source can stand in for and its time window, so that I know when my note clears a gap.
25. As the user, I want to add and remove evidence rows, so that I can enter as many sources as I have.
26. As the user, I want an evidence row to warn me when its publication time is after now, so that I know it will be excluded.
27. As the user, I want the Private lean stage visibly separated from the evidence, so that I trust my lean stays out of the evidence packet and thesis.
28. As the user, I want the Review stage to list what will freeze (game, research offer, decision cutoff, evidence, gaps, model identity, policy result), so that I understand the permanence before I commit.
29. As the user, I want the Review stage to say that a later price becomes a refresh, so that I know I am not locking myself out of a new price.
30. As the user, I want the main button to read "Freeze & analyze", so that the label states what happens.
31. As the user, I want the button disabled while saving, with a visible saving status, so that I cannot submit twice.
32. As the user, I want invalid entry to keep everything I typed and point me to the stage with the problem, so that I can fix it quickly.
33. As the user, I want the report to open with its frozen status, freeze time, decision cutoff, and whether it is the primary, a refresh, ineligible, or unclassified, so that I know what kind of record I am reading.
34. As the user, I want a short, quiet seal motion when a snapshot freezes, so that the moment of permanence is felt without hype.
35. As the user, I want snapshot provenance shown, including legacy-unknown for old entries, so that I never mistake an unconfirmed fact for a recorded one.
36. As the user, I want the research offer and price mathematics laid out with aligned figures, so that I can read implied and no-vig probabilities quickly.
37. As the user, I want the policy result shown as the report's conclusion, with pass, wait, and insufficient evidence given equal visual dignity to a lean, so that passing never looks like failure.
38. As the user, I want every evidence item to show its source, retrieval time, and publication time separately, so that I can judge freshness.
39. As the user, I want each evidence gap marked with an icon, a word, and a highlight, so that gaps stand out without relying on colour.
40. As the user, I want stale, late, unrelated, and unknown-time evidence to stay visible with its reason, so that I see why it did not clear a gap.
41. As the user, I want the experimental model labelled experimental and unreleased, with its protocol progress, so that I never read it as a validated edge.
42. As the user, I want no green money glow, celebration, or edge meter anywhere, so that the design never implies profit.
43. As the user, I want unknown cost, an unresolved result, and a missing close shown as unavailable with a reason, so that I never read them as zero.
44. As the user, I want provider usage to show requests, tokens, and cost with a "partial" mark when a field is unknown, so that I trust the totals.
45. As the user, I want an ambiguous provider outcome shown as a clear warning that needs a deliberate new attempt, so that I do not pay twice by accident.
46. As the user, I want the refresh form on the report to say what it keeps (market, selection) and what it may change, so that I do not try to change the market there.
47. As the user, I want a refresh to link to its parent and the parent to list its refreshes, so that I can follow the chain.
48. As the user, I want the Journal to separate assessment performance from actual-bet performance visually, so that I never mix the two samples.
49. As the user, I want Journal tables to turn into stacked rows on a phone, so that I never scroll sideways.
50. As the user, I want the actual-bet form to call its terms a contract and show where it differs from the research offer, so that a different placed line is obvious.
51. As the user, I want settlement corrections shown as new notices that name the earlier one, so that the history stays append-only and readable.
52. As the user, I want comparable close, line movement, and missing close to look different, so that I do not misread a moved line as an odds change.
53. As the user, I want export and restore controls to explain what the file contains and that restore validates the whole file first, so that I trust the backup.
54. As the user, I want Settings to show each provider's catalog with its retrieval time and whether the model can draft, so that I choose a working model.
55. As the user, I want the Handbook styled for long reading, so that the reference is comfortable to read.
56. As the user, I want primary navigation that works with one thumb on a phone, so that I can move between Analyze, Journal, Handbook, and Settings easily.
57. As the user, I want visible keyboard focus and full keyboard operation, so that I can work without a mouse.
58. As the user, I want WCAG 2.2 AA contrast in both themes, so that text stays readable in any light.
59. As the user, I want touch targets of at least 24px and 44px for primary actions, so that I can tap accurately.
60. As the user, I want motion turned off when my device asks for reduced motion, so that the interface stays calm.
61. As the user, I want fonts served by the app itself, so that the app does not call a font CDN.
62. As the user, I want the app to keep working before scripts load, so that a slow load never blocks a submission.

## Implementation Decisions

- **Direction choice first.** Three throwaway HTML prototypes are built before any repository change: A Archive ledger, B Broadcast telemetry, C Field almanac. The chosen one becomes the design tokens for the real build. The others are discarded.
- **Component split.** shadcn-svelte components (built on Bits UI) cover standard parts: button, input, textarea, label, tabs, dialog, sheet, popover, tooltip, toggle group, badge, separator, table. Bits UI is used directly only where shadcn-svelte has no component. Melt (the Svelte 5 `melt` builders) is used only for custom controls: the theme switch and the Research offer sheet. The odds and line stepper and the stage navigation are plain Svelte because Melt has no builder that fits them. Each control has exactly one library owning its behaviour. Record this split as an ADR when the build starts.
- **Styling.** Tailwind v4 with CSS-variable design tokens that hold the chosen direction's palette, type scale, spacing, and radius. Every colour is a token with light and dark values. Components style through tokens only.
- **Native selects stay.** Game, market, selection, tie rule, and evidence "stands in for" remain native select elements, styled. They give the best phone pickers, work before scripts load, and keep the browser acceptance tests' option-based selection valid.
- **Stages are sections, not hidden panels.** All Analyze fields stay rendered in one form. The stage rail is navigation and progress: it scrolls to a stage and reports each stage's state. Completed stages may compact visually but never remove or hide required inputs. The form posts without client scripts.
- **Stage state.** Each stage is one of: not started, in progress, complete, needs attention. A stage needs attention when the server returns a field error for it or when a client check fails. The first stage needing attention receives focus after a failed submission.
- **Research offer summary.** A component that renders from the current field values: game, market, selection, point line, tie rule, sportsbook, American odds, implied probability, and observation time. On wide screens it is a sticky side panel. On narrow screens it is a fixed bottom bar showing selection, line, and odds, which expands to a sheet. It never uses the word contract.
- **Odds stepping rule.** A pure function steps American odds by 5. Even money is shown as +100. Stepping up from −105 gives +100, and stepping down from +100 gives −105. Typed values are validated by the existing offer rules, not by the stepper.
- **Freeze language.** The final stage is titled Review and lists what freezes. The submit button reads "Freeze & analyze" and changes to a saving state while pending. The existing duplicate-submission guard stays.
- **Theme preference.** Three values: light, dark, system. Stored in a cookie. The server reads it in a hook and sets the root theme attribute before rendering, so there is no flash. System sets no attribute and follows the device setting. The switch is reachable from the navigation on every route.
- **State presentation.** One shared set of components presents record state: frozen, primary, refresh, ineligible, unclassified, legacy-unknown, gap, stale, unknown, unavailable, partial, ambiguous. Each pairs an icon and a word with its colour. Unknown and unavailable never render as zero.
- **No profit signalling.** Positive expected value, a lean, or a model probability gets no celebratory colour, glow, or animation. Semantic colour is reserved for record state and warnings.
- **Motion.** Short eased transitions only to show a change of state: stage movement, the freeze seal, gap reveal, sheet open. No bounce or overshoot, no ambient decoration. Everything is disabled under reduced motion.
- **Accessibility.** WCAG 2.2 AA in both themes, checked for every token pairing. Touch targets of at least 24px and 44px for primary actions. Visible focus rings. Landmarks and headings stay meaningful.
- **Fonts.** Self-hosted through Fontsource packages. No request to a font CDN, consistent with the verification fetch guard.
- **Markup contract.** Every existing test identifier and accessible label is preserved on the element that carries the same meaning. Server loads, actions, and domain code do not change. This is a presentation change.
- **Routes covered.** Analyze, analysis report, Journal, Handbook, Settings, and the shared layout with navigation and theme switch.

## Testing Decisions

- A good test drives the production server the way the user does and asserts saved records, returned failures, exports, and outgoing requests. It does not assert class names, colours, or component internals.
- **Primary seam: browser acceptance.** The existing Playwright research-flow suite against the built production server in fixture-browser mode stays the main check. It must pass with every existing test identifier. Edits are allowed only for intended behaviour changes, such as the "Freeze & analyze" label and focus moving to the first stage needing attention.
- New acceptance cases at the same seam: the theme cookie selects the server-rendered theme and the switch changes it; a failed submission focuses the first stage needing attention and keeps every typed value; Analyze and the report have no horizontal page overflow at 390px width; the report shows unknown cost as unavailable, not zero.
- **Secondary seam: pure domain units.** The odds stepping rule and theme preference parsing are pure functions tested like the existing domain unit tests, such as the offer and odds tests.
- Accessibility is checked with an automated scan of Analyze, the report, and the Journal in both themes during browser acceptance, plus a manual keyboard pass.
- Prior art: the research-flow acceptance suite, and the odds and offer unit tests in the domain library.
- `npm run verify` is the completion check. `npm run verify:database` is unaffected because storage does not change.

## Out of Scope

- Any change to server loads, form actions, domain mathematics, policy, storage, migrations, providers, or the release protocol.
- New features beyond presentation, the staged Analyze flow, and the theme switch.
- A React rewrite or the React shadcn/ui registry.
- Charts or performance visualisations beyond the existing summaries.
- New sports, live betting, automatic bet placement, bankroll advice, and multi-user deployment.
- Marketing or landing pages.

## Further Notes

- Banned patterns for every direction: purple or blue gradients, Inter or Space Grotesk, a centred hero over three identical cards, nested cards, a gray 1px border on every block, glassmorphism or neon glow, bounce easing, cream with terracotta, emoji section markers, and gradient text on numbers.
- The fixture clock is 2026-10-25T16:00:00Z, so acceptance screenshots show that date.
- Use the glossary terms in all interface copy: research offer, contract, actual bet, analysis snapshot, freeze, refresh, primary.
