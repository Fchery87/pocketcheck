-- Settlement notices for model picks are keyed to the game, not to a board. A final score is a
-- fact about the game: every board of that game, including a refresh, is graded by the same
-- notices, and the existing unique event identifier still yields exactly one grade.
-- A notice names either an analysis (every row written before this migration) or a game.
-- Existing rows are not rewritten: the new column stays null for them and the check holds.

ALTER TABLE settlement_notices ALTER COLUMN analysis_id DROP NOT NULL;

ALTER TABLE settlement_notices
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES games (id);

ALTER TABLE settlement_notices
  DROP CONSTRAINT IF EXISTS settlement_notices_one_subject;
ALTER TABLE settlement_notices
  ADD CONSTRAINT settlement_notices_one_subject CHECK (
    (analysis_id IS NOT NULL AND game_id IS NULL)
    OR (analysis_id IS NULL AND game_id IS NOT NULL AND bet_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS settlement_notices_game
  ON settlement_notices (game_id, recorded_at)
  WHERE game_id IS NOT NULL;
