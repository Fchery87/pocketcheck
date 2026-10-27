-- Game boards and model picks. A game board is its own journal record, never an analysis:
-- the prices for one game from one sportsbook at one observation time. Each entered market
-- holds both sides as full offers. A market's model pick, or the reason it has none, is
-- frozen once. A board is immutable after it reaches a terminal status; model picks are
-- append-only and keep the calculation version they were graded under.
CREATE TABLE IF NOT EXISTS game_boards (
  id uuid PRIMARY KEY,
  submission_id text NOT NULL UNIQUE,
  request_hash text NOT NULL,
  parent_id uuid REFERENCES game_boards (id),
  game_id uuid NOT NULL REFERENCES games (id),
  game jsonb NOT NULL,
  sportsbook text NOT NULL,
  observed_at timestamptz NOT NULL,
  kickoff_at timestamptz NOT NULL,
  cutoff_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'interrupted')),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  failure_reason text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_boards_pregame CHECK (observed_at < kickoff_at),
  CONSTRAINT game_boards_terminal CHECK (
    (status IN ('pending', 'running')) = (completed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS game_boards_game ON game_boards (game_id);

DROP TRIGGER IF EXISTS game_boards_completed_immutable ON game_boards;
CREATE TRIGGER game_boards_completed_immutable
  BEFORE UPDATE OR DELETE ON game_boards
  FOR EACH ROW EXECUTE FUNCTION reject_completed_mutation();

CREATE TABLE IF NOT EXISTS board_markets (
  id uuid PRIMARY KEY,
  board_id uuid NOT NULL REFERENCES game_boards (id),
  market text NOT NULL CHECK (market IN ('moneyline', 'spread', 'total')),
  -- Home (or over) first, then away (or under), each naming the other as its opposing price.
  offers jsonb NOT NULL CHECK (jsonb_typeof(offers) = 'array' AND jsonb_array_length(offers) = 2),
  no_pick_reason text,
  -- Set when the market's model pick, or the reason it has none, is frozen.
  frozen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT board_markets_one_per_market UNIQUE (board_id, market)
);

-- Only the freeze may change a market row, and only once.
CREATE OR REPLACE FUNCTION reject_frozen_board_market_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE'
    OR OLD.frozen_at IS NOT NULL
    OR NEW.board_id IS DISTINCT FROM OLD.board_id
    OR NEW.market IS DISTINCT FROM OLD.market
    OR NEW.offers IS DISTINCT FROM OLD.offers
  THEN
    RAISE EXCEPTION 'frozen % rows are immutable', TG_TABLE_NAME
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS board_markets_frozen_immutable ON board_markets;
CREATE TRIGGER board_markets_frozen_immutable
  BEFORE UPDATE OR DELETE ON board_markets
  FOR EACH ROW EXECUTE FUNCTION reject_frozen_board_market_mutation();

CREATE TABLE IF NOT EXISTS model_picks (
  id uuid PRIMARY KEY,
  board_id uuid NOT NULL REFERENCES game_boards (id),
  market text NOT NULL CHECK (market IN ('moneyline', 'spread', 'total')),
  parent_pick_id uuid REFERENCES model_picks (id),
  calculation_version text NOT NULL,
  picked_selection text NOT NULL CHECK (picked_selection IN ('home', 'away', 'over', 'under')),
  strength_grade text NOT NULL CHECK (strength_grade IN ('strong', 'lean', 'no edge')),
  release_label text NOT NULL CHECK (release_label IN ('released', 'unvalidated')),
  calculation jsonb NOT NULL,
  forecasting_model jsonb NOT NULL,
  forecast jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT model_picks_one_per_market UNIQUE (board_id, market),
  CONSTRAINT model_picks_market FOREIGN KEY (board_id, market)
    REFERENCES board_markets (board_id, market)
);

DROP TRIGGER IF EXISTS model_picks_append_only ON model_picks;
CREATE TRIGGER model_picks_append_only
  BEFORE UPDATE OR DELETE ON model_picks
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
