-- PocketCheck durable journal. All timestamps are timestamptz (UTC).
-- Completed offers, evidence, and reports are immutable.

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY,
  source_game_id text NOT NULL UNIQUE,
  season integer NOT NULL,
  week integer,
  away_team text NOT NULL,
  home_team text NOT NULL,
  kickoff_at timestamptz NOT NULL,
  venue text,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offers (
  id uuid PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES games (id),
  sportsbook text NOT NULL,
  market text NOT NULL CHECK (market IN ('moneyline', 'spread', 'total')),
  selection text NOT NULL,
  point_line numeric,
  american_odds integer NOT NULL CHECK (american_odds <> 0 AND NOT (american_odds > 0 AND american_odds < 100)),
  decimal_odds numeric NOT NULL CHECK (decimal_odds > 1),
  observed_at timestamptz NOT NULL,
  entered_at timestamptz NOT NULL,
  kickoff_at timestamptz NOT NULL,
  rules jsonb NOT NULL,
  opposing jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offers_pregame CHECK (observed_at < kickoff_at)
);

CREATE TABLE IF NOT EXISTS evidence (
  id uuid PRIMARY KEY,
  source_id text NOT NULL,
  source_url text,
  retrieved_at timestamptz NOT NULL,
  published_at timestamptz,
  effective_at timestamptz,
  checksum text NOT NULL,
  body jsonb NOT NULL,
  origin text NOT NULL CHECK (origin IN ('manual', 'automatic')),
  completeness text NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analyses (
  id uuid PRIMARY KEY,
  offer_id uuid NOT NULL REFERENCES offers (id),
  parent_id uuid REFERENCES analyses (id),
  cutoff_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'interrupted')),
  conclusion text,
  method_version text,
  policy_version text,
  schema_version text,
  prompt_version text,
  evidence_packet_hash text,
  provider text,
  model text,
  failure_reason text,
  idempotency_key text UNIQUE,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analyses_completed_has_conclusion CHECK (
    status <> 'completed' OR (conclusion IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS analysis_evidence (
  analysis_id uuid NOT NULL REFERENCES analyses (id),
  evidence_id uuid NOT NULL REFERENCES evidence (id),
  completeness text NOT NULL,
  PRIMARY KEY (analysis_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY,
  analysis_id uuid NOT NULL UNIQUE REFERENCES analyses (id),
  claims jsonb NOT NULL,
  thesis text NOT NULL,
  usage jsonb,
  rendered_bytes bytea NOT NULL,
  completed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_research (
  id uuid PRIMARY KEY,
  analysis_id uuid NOT NULL UNIQUE REFERENCES analyses (id),
  lean text,
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bets (
  id uuid PRIMARY KEY,
  offer_id uuid NOT NULL REFERENCES offers (id),
  analysis_id uuid REFERENCES analyses (id),
  american_odds integer NOT NULL CHECK (american_odds <> 0 AND NOT (american_odds > 0 AND american_odds < 100)),
  decimal_odds numeric NOT NULL CHECK (decimal_odds > 1),
  placed_at timestamptz NOT NULL,
  stake_units numeric NOT NULL CHECK (stake_units > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settlements (
  id uuid PRIMARY KEY,
  bet_id uuid REFERENCES bets (id),
  offer_id uuid REFERENCES offers (id),
  result text NOT NULL CHECK (result IN ('win', 'loss', 'push', 'void', 'unresolved')),
  rules text NOT NULL,
  source text NOT NULL,
  reason text,
  settled_at timestamptz NOT NULL,
  corrects_id uuid REFERENCES settlements (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settlements_target CHECK (bet_id IS NOT NULL OR offer_id IS NOT NULL)
);

CREATE OR REPLACE FUNCTION reject_completed_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'completed % rows are immutable', TG_TABLE_NAME
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'completed % rows are immutable', TG_TABLE_NAME
        USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS offers_immutable ON offers;
CREATE TRIGGER offers_immutable
  BEFORE UPDATE OR DELETE ON offers
  FOR EACH ROW EXECUTE FUNCTION reject_completed_mutation();

DROP TRIGGER IF EXISTS evidence_immutable ON evidence;
CREATE TRIGGER evidence_immutable
  BEFORE UPDATE OR DELETE ON evidence
  FOR EACH ROW EXECUTE FUNCTION reject_completed_mutation();

DROP TRIGGER IF EXISTS reports_immutable ON reports;
CREATE TRIGGER reports_immutable
  BEFORE UPDATE OR DELETE ON reports
  FOR EACH ROW EXECUTE FUNCTION reject_completed_mutation();

DROP TRIGGER IF EXISTS analyses_completed_immutable ON analyses;
CREATE TRIGGER analyses_completed_immutable
  BEFORE UPDATE OR DELETE ON analyses
  FOR EACH ROW EXECUTE FUNCTION reject_completed_mutation();
