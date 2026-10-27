# 03: Moneyline game board to model pick (tracer bullet)

**What to build:** The first end-to-end path. From the home page, the user opens a game board, picks an upcoming game, enters a sportsbook, observation time, tie rule, and both moneylines, and submits. A model pick card appears:

- the picked side
- the strength grade (strong, lean, or no edge)
- the "Unvalidated model pick" label with the note that the forecasting model has not beaten the closing market
- both sides' model probabilities, no-vig probabilities, margin, expected value per unit, and the price cutoff for the grade

The game board and its model pick are frozen in the journal (memory and Neon). This ticket builds every layer once: board parsing, the versioned model pick calculation, the game board and model pick records with migrations, the board form, and the pick page.

**Blocked by:** 01

**Status:** resolved

- [x] The model pick calculation is pure and versioned separately from the research policy. It picks the higher expected value, breaks ties by model win probability, then home with no edge
- [x] Grades: strong when conservative expected value exceeds the versioned threshold, lean when point expected value is positive, otherwise no edge. Table-tested at the boundaries
- [x] Released markets read "Released model pick"; unreleased read "Unvalidated model pick". The research analysis policy and its conclusions are unchanged
- [x] An unavailable or leaked forecasting model gives no model pick and a visible reason; the board still saves
- [x] The game board is a separate record from the analysis snapshot, with its own submission identifier, idempotency, and conflict rejection
- [x] Neon migrations apply with `npm run db:migrate`; the shared store contract covers save and readback on memory and Neon
- [x] Run-level tests (memory journal, scripted model source, fixture drafter) assert the saved board and pick
- [x] A browser test enters both moneylines and sees the pick card with the unvalidated label
- [x] `npm run verify` and `TEST_DATABASE_URL=... npm run verify:database` pass

## Answer

The pure model pick calculation lives in `src/lib/server/analysis/model-pick.ts` (version `model-pick-2026-10-27.1`), separate from the research policy.
Game boards and model picks are frozen records with their own submission identifier, kept in the memory and Neon stores; migration `012_game_boards.sql` adds the tables.
The `/board` form and the `/board/[id]` pick page show the pick card with the "Unvalidated model pick" label.
Boards reject odds from -100 to +100, and an unavailable or leaked forecasting model gives no pick with a visible reason.
