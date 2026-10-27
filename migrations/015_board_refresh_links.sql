-- A refreshed board's model pick links to its parent board's pick in the same market, and to
-- nothing else. The parent's rows are never touched: this checks the new pick only.
CREATE OR REPLACE FUNCTION check_model_pick_parent() RETURNS trigger AS $$
BEGIN
  IF NEW.parent_pick_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM model_picks parent_pick
    JOIN game_boards child ON child.id = NEW.board_id
    WHERE parent_pick.id = NEW.parent_pick_id
      AND parent_pick.board_id = child.parent_id
      AND parent_pick.market = NEW.market
  ) THEN
    RAISE EXCEPTION 'a model pick links only to its parent board''s pick in the same market'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS model_picks_parent_check ON model_picks;
CREATE TRIGGER model_picks_parent_check
  BEFORE INSERT ON model_picks
  FOR EACH ROW EXECUTE FUNCTION check_model_pick_parent();
