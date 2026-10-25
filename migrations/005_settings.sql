-- Non-secret settings. Unlike the journal these change in place: the chosen drafter, each
-- provider's latest model catalog, and the latest capability test per model.

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_catalogs (
  provider text PRIMARY KEY,
  base_url text NOT NULL,
  retrieved_at timestamptz NOT NULL,
  entries jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS model_tests (
  provider text NOT NULL,
  model_id text NOT NULL,
  ok boolean NOT NULL,
  reason text,
  tested_at timestamptz NOT NULL,
  PRIMARY KEY (provider, model_id)
);

-- Tokens and provider-reported cost for a run's drafting, kept for failed runs too.
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS usage jsonb;
