-- Frozen primary classification for model picks, and closing observations of a model pick.
-- A model pick is append-only, so its role lives in its own append-only row, written in the same
-- transaction that moves the board to a terminal status. It comes from completion order and the
-- pregame cutoff, never from scores. A primary pick records the prospective protocol its forecast
-- is frozen under. Picks on boards that finished before this migration have no row and read as
-- unclassified: their completion was not proven to precede outcomes.
CREATE TABLE IF NOT EXISTS model_pick_roles (
  pick_id uuid PRIMARY KEY REFERENCES model_picks (id),
  game_id uuid NOT NULL REFERENCES games (id),
  market text NOT NULL CHECK (market IN ('moneyline', 'spread', 'total')),
  role text NOT NULL CHECK (role IN ('primary', 'refresh', 'ineligible')),
  reason text NOT NULL,
  primary_pick_id uuid REFERENCES model_picks (id),
  protocol_id text,
  classified_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT model_pick_roles_shape CHECK (
    (role = 'primary' AND primary_pick_id IS NULL AND protocol_id IS NOT NULL)
    OR (role = 'refresh' AND protocol_id IS NULL)
    OR (role = 'ineligible' AND primary_pick_id IS NULL AND protocol_id IS NULL)
  )
);

-- One primary per game and market, even when two boards finish at once.
CREATE UNIQUE INDEX IF NOT EXISTS model_pick_roles_one_primary
  ON model_pick_roles (game_id, market)
  WHERE role = 'primary';

DROP TRIGGER IF EXISTS model_pick_roles_append_only ON model_pick_roles;
CREATE TRIGGER model_pick_roles_append_only
  BEFORE UPDATE OR DELETE ON model_pick_roles
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

-- A closing observation may belong to a model pick. Existing rows are not rewritten: the column
-- is nullable and stays null for them.
ALTER TABLE closing_observations
  ADD COLUMN IF NOT EXISTS model_pick_id uuid REFERENCES model_picks (id);

ALTER TABLE closing_observations DROP CONSTRAINT IF EXISTS closing_observations_subject;
ALTER TABLE closing_observations ADD CONSTRAINT closing_observations_subject CHECK (
  (analysis_id IS NOT NULL)::int + (bet_id IS NOT NULL)::int + (model_pick_id IS NOT NULL)::int = 1
);

CREATE INDEX IF NOT EXISTS closing_observations_model_pick
  ON closing_observations (model_pick_id)
  WHERE model_pick_id IS NOT NULL;
