-- Append-only settlement notices. Grades are derived from the recorded contract.
-- A repeated event with the same payload is ignored. A different payload reuses
-- the event identifier and is rejected. Corrections name the earlier notice.

CREATE TABLE IF NOT EXISTS settlement_notices (
  id uuid PRIMARY KEY,
  event_id text NOT NULL,
  analysis_id uuid NOT NULL REFERENCES analyses (id),
  bet_id uuid REFERENCES bets (id),
  kind text NOT NULL CHECK (kind IN ('final', 'postponed', 'void', 'unresolved')),
  home_score integer,
  away_score integer,
  source text NOT NULL,
  reason text,
  corrects_id uuid REFERENCES settlement_notices (id),
  recorded_at timestamptz NOT NULL,
  payload_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS settlement_notices_event_id
  ON settlement_notices (event_id);

DROP TRIGGER IF EXISTS settlement_notices_append_only ON settlement_notices;
CREATE TRIGGER settlement_notices_append_only
  BEFORE UPDATE OR DELETE ON settlement_notices
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
