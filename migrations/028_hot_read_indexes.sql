-- The Journal page and the report pages read completed analyses in creation order, one subject's
-- settlement notices, and completed boards most recently first. Without these indexes each read
-- scans the table and sorts. Partial indexes keep the hot subset small.

CREATE INDEX IF NOT EXISTS analyses_completed_created
  ON analyses (created_at DESC)
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS settlement_notices_analysis
  ON settlement_notices (analysis_id, recorded_at);

CREATE INDEX IF NOT EXISTS game_boards_completed
  ON game_boards (completed_at, id)
  WHERE completed_at IS NOT NULL;
