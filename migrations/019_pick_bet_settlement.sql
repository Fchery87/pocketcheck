-- A settlement notice may grade an actual bet placed from a model pick. That bet has no
-- analysis, so the notice names the bet and neither an analysis nor a game. Existing notices
-- are not rewritten: analysis notices stay analysis notices, and game notices stay game notices.
-- The unique event identifier still yields exactly one notice.

ALTER TABLE settlement_notices
  DROP CONSTRAINT IF EXISTS settlement_notices_one_subject;

ALTER TABLE settlement_notices
  ADD CONSTRAINT settlement_notices_one_subject CHECK (
    (analysis_id IS NOT NULL AND game_id IS NULL)
    OR (analysis_id IS NULL AND game_id IS NOT NULL AND bet_id IS NULL)
    OR (analysis_id IS NULL AND game_id IS NULL AND bet_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS settlement_notices_bet
  ON settlement_notices (bet_id, recorded_at)
  WHERE bet_id IS NOT NULL AND analysis_id IS NULL;
