-- The probability model a run froze: artifact identity, the offer's probabilities, and
-- whether the market was eligible. Recorded even when unreleased, so the model can be scored
-- on real offers later.
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS probability_model jsonb;
