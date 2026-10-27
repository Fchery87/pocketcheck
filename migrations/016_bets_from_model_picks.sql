-- An actual bet may start from a model pick. The bet keeps its own contract, odds, stake, and
-- submission identifier; the pick reference only records where it started. Existing bets are
-- not rewritten: the column is nullable and stays null for them. A bet belongs to one analysis
-- or one model pick, never both, so a pick bet has no analysis and no researched offer.
ALTER TABLE bets ADD COLUMN IF NOT EXISTS model_pick_id uuid REFERENCES model_picks (id);

CREATE INDEX IF NOT EXISTS bets_model_pick ON bets (model_pick_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bets_one_origin' AND conrelid = 'bets'::regclass
  ) THEN
    ALTER TABLE bets ADD CONSTRAINT bets_one_origin
      CHECK (analysis_id IS NULL OR model_pick_id IS NULL);
  END IF;
END
$$;
