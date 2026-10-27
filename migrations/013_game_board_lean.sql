-- The private lean entered with a game board. It lives in its own columns, apart from the
-- evidence, the gaps, and every model pick, and is set only when the board is created.
-- Both columns are null together when no lean was entered.
ALTER TABLE game_boards ADD COLUMN IF NOT EXISTS lean_text text;
ALTER TABLE game_boards ADD COLUMN IF NOT EXISTS lean_rationale text;
ALTER TABLE game_boards DROP CONSTRAINT IF EXISTS game_boards_lean_together;
ALTER TABLE game_boards ADD CONSTRAINT game_boards_lean_together CHECK (
  (lean_text IS NULL) = (lean_rationale IS NULL)
);
