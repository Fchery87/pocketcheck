-- A finished game board withdrawn from performance, with the reason. Append-only and one per board:
-- withdrawing never edits the board, its picks, or their frozen roles. A withdrawn primary leaves
-- its game and market without a primary observation.
CREATE TABLE IF NOT EXISTS board_withdrawals (
  board_id uuid PRIMARY KEY REFERENCES game_boards (id),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  withdrawn_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS board_withdrawals_append_only ON board_withdrawals;
CREATE TRIGGER board_withdrawals_append_only
  BEFORE UPDATE OR DELETE ON board_withdrawals
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
