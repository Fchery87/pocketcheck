-- The drafter's explanation of a game board's model picks. The drafter identity is saved when
-- the board begins, apart from the forecasting model each model pick records. Provider exchanges
-- and usage are saved right after the drafter answers, before its text is validated, so a later
-- failure can finalize from the saved response. The explanation is saved only with a completed
-- board; a board whose text contradicted its picks fails and keeps the picks.
-- Boards saved before this migration have no drafter, no exchanges, and no explanation.
ALTER TABLE game_boards ADD COLUMN IF NOT EXISTS drafter_id text;
ALTER TABLE game_boards ADD COLUMN IF NOT EXISTS drafter_model_id text;
ALTER TABLE game_boards
  ADD COLUMN IF NOT EXISTS provider_requests jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE game_boards
  ADD COLUMN IF NOT EXISTS provider_outcome_ambiguous boolean NOT NULL DEFAULT false;
ALTER TABLE game_boards ADD COLUMN IF NOT EXISTS usage jsonb;
ALTER TABLE game_boards ADD COLUMN IF NOT EXISTS explanation jsonb;

ALTER TABLE game_boards DROP CONSTRAINT IF EXISTS game_boards_drafter_together;
ALTER TABLE game_boards ADD CONSTRAINT game_boards_drafter_together CHECK (
  (drafter_id IS NULL) = (drafter_model_id IS NULL)
);
ALTER TABLE game_boards DROP CONSTRAINT IF EXISTS game_boards_explanation_completed;
ALTER TABLE game_boards ADD CONSTRAINT game_boards_explanation_completed CHECK (
  explanation IS NULL OR status = 'completed'
);
