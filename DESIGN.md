# PocketCheck design

The interface is a field almanac: an engineering pad with a pen and a highlighter. The record is the product, so the design makes frozen, sourced, and missing look different at a glance. It never makes anything look like winning.

Approved on 2026-10-26 from prototype C (`.scratch/ui-redesign/prototypes/c.html`). Token values live in `src/app.css`. This file holds the rules those values serve. When the two disagree, fix whichever one broke the rule.

## Materials

- **Paper.** A neutral off-white page in light mode and a near-black page in dark mode, both with a faint 24px grid. Do not tint it green, blue, or cream.
- **Ink.** Graphite text and rules. Ink also marks what is permanent.
- **Pen.** Ballpoint blue marks what you can act on: the primary action, the current stage, focus, links, and evidence references.
- **Highlighter.** Pink marks what is missing, stale, or needs attention.

## Colour meanings

Each colour has one meaning. Do not borrow one for decoration.

| Token family                             | Means                                 | Never use it for                       |
| ---------------------------------------- | ------------------------------------- | -------------------------------------- |
| Ink block (`--ink` fill, `--paper` text) | Frozen, permanent                     | Buttons, hover states                  |
| Pen (`--pen`)                            | Actionable, current, focus            | Status, emphasis in prose              |
| Highlighter (`--hl`)                     | Gap, stale, needs attention, excluded | Frozen, primary, success, decoration   |
| Ok (`--ok`)                              | A stage is complete                   | Expected value, a lean, a model result |
| Muted ink (`--ink-2`)                    | Secondary text and metadata           | Body text that carries a rule          |

No colour signals profit. Positive expected value, a lean, a model probability, and a winning grade get no green, no glow, and no animation.

## Type

| Role    | Face                                | Use                                                                  |
| ------- | ----------------------------------- | -------------------------------------------------------------------- |
| Display | Anybody (variable width and weight) | Page and stage headings, matchups, the policy result, stage numerals |
| Body    | Atkinson Hyperlegible Next          | Running text, labels, form fields                                    |
| Figures | Martian Mono                        | Odds, lines, probabilities, times, identifiers, kickers              |

- Display text uses width as character: wide (115–150%) for headings and matchups, narrow (60–70%) for numerals and evidence identifiers.
- Every figure that can line up in a column uses tabular numbers.
- The smallest text is 14px. Hints and metadata that carry a rule are never smaller.
- Fonts are self-hosted. The app makes no request to a font service.

## Record states

Every state pairs a mark with a word, so colour is never the only signal. Use the shared state component; do not restyle one inline.

| State                                | Treatment                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Frozen                               | Ink block with "■ Frozen" and the freeze time                                                                 |
| Primary                              | Outlined tag "● Primary assessment"                                                                           |
| Refresh                              | Outlined tag naming the parent analysis                                                                       |
| Ineligible, unclassified             | Outlined tag with a dashed border and the reason                                                              |
| Legacy-unknown                       | Dashed tag "Legacy: original provenance unknown"                                                              |
| Gap                                  | Highlighter on "▲ Gap" and on the sentence that names what is missing                                         |
| Stale, late, unrelated, unknown time | Highlighter on "◷ Stale" (or the matching word) and the reason it does not clear the gap                      |
| Unknown, unavailable                 | Muted "∅ Unknown" or "∅ Unavailable" with a dotted underline and the reason. Never a zero, never a dash alone |
| Partial                              | The word "Partial" beside the total                                                                           |
| Ambiguous provider outcome           | Highlighter warning that a deliberate new attempt is required                                                 |
| Experimental model                   | Dashed tag "Experimental, not released" with protocol progress                                                |

Stage states in Analyze: ○ Not started, ◐ In progress, ● Complete, ◌ Optional, ▲ Needs attention, ● Ready to freeze. On desktop the stage numeral is outlined until its stage is complete, then filled with ink. A stage that needs attention fills the numeral with highlighter.

## Layout

- **Analyze** is one form in five stages: Game, Offer, Your evidence, Private lean, Review. All fields stay on the page. The stage list navigates and reports progress. It never hides a field.
- **Research offer** sits beside the form on wide screens and becomes a bottom bar that expands on narrow screens. It is never called a contract.
- **The report** opens with the matchup and a column of frozen times, then the policy result beside the price, then evidence beside the thesis, lean, and usage.
- **Lines, not boxes.** Separate content with whitespace, rules, and the grid. Fields get a thin border. A container that needs setting apart gets a single ink rule down its left side.
- **Hard offset shadows** belong to two elements only: the primary action ("Freeze & analyze") and the Research offer panel.
- Running text stays under about 65 characters wide.

## Phone

- Design Analyze for a phone first. The report and Journal are designed for desktop and stay fully usable on a phone.
- The header is one row (logo and theme switch) plus a scrolling nav row. Hide scrollbars on scrolling strips.
- Giant stage numerals are desktop-only. On a phone the stage list carries the numbers.
- No horizontal page scroll at 390px. Tables become stacked rows.
- Touch targets are at least 24px, and 44px for primary actions and stage navigation.

## Motion

Motion shows a change of state and nothing else: moving between stages, the frozen stamp swipe, a sheet opening, a gap appearing. Use short ease-out curves with no bounce or overshoot. Everything stops under `prefers-reduced-motion`. No ambient or decorative animation.

## Theme

Light, Dark, and System, stored in a cookie and applied by the server before the page paints. System follows the device. Every colour is a token with a value for each theme; components never hard-code a colour.

## Accessibility

WCAG 2.2 AA in both themes. Text meets 4.5:1 (3:1 for large display text). Field borders and focus rings meet 3:1. Focus is always visible. State is never shown by colour alone.

## Implementation rules

- Components come from shadcn-svelte on Bits UI. Melt builders are only for the theme switch and the Research offer sheet. The odds and line stepper and the stage navigation are plain Svelte. See `docs/adr/0001-component-library-split.md`.
- Game, market, selection, tie rule, and evidence "stands in for" stay native `<select>` elements.
- Keep a global `[hidden] { display: none !important; }` so a component's display style never shows a hidden field.
- Preserve every `data-testid` and accessible label when restyling.
- Interface copy uses the glossary terms: research offer, contract, actual bet, analysis snapshot, freeze, refresh, primary.

## Banned

Purple or blue gradients. Inter, Roboto, or Space Grotesk. A centred hero over three identical cards. Cards nested in cards. A border on every block. Glassmorphism or glow. Bounce or elastic easing. Cream with terracotta. Emoji as section markers. Gradient text on numbers. Thick black borders with hard shadows on everything.
