-- Closing observations are later looks at a researched offer or a placed bet.
-- They are append-only. An untimestamped archive is not an observed offer:
-- observed_at stays null and provenance is archived-untimestamped.
CREATE TABLE IF NOT EXISTS closing_observations (
  id uuid PRIMARY KEY,
  analysis_id uuid REFERENCES analyses (id),
  bet_id uuid REFERENCES bets (id),
  provenance text NOT NULL CHECK (provenance IN ('observed', 'archived-untimestamped')),
  sportsbook text NOT NULL,
  market text NOT NULL CHECK (market IN ('moneyline', 'spread', 'total')),
  selection text NOT NULL CHECK (selection IN ('home', 'away', 'over', 'under')),
  point_line double precision,
  rules jsonb NOT NULL,
  american_odds integer NOT NULL CHECK (american_odds <> 0 AND NOT (american_odds > 0 AND american_odds < 100)),
  decimal_odds double precision NOT NULL CHECK (decimal_odds > 1),
  observed_at timestamptz,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT closing_observations_subject CHECK (
    (analysis_id IS NOT NULL AND bet_id IS NULL) OR (analysis_id IS NULL AND bet_id IS NOT NULL)
  ),
  CONSTRAINT closing_observations_time CHECK (
    (provenance = 'observed' AND observed_at IS NOT NULL)
    OR (provenance = 'archived-untimestamped' AND observed_at IS NULL)
  )
);

DROP TRIGGER IF EXISTS closing_observations_append_only ON closing_observations;
CREATE TRIGGER closing_observations_append_only
  BEFORE UPDATE OR DELETE ON closing_observations
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
