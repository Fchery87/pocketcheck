-- A board market records its anchor sportsbook's own two sides apart from the executable offers,
-- with the pricing format that wrote them. A market saved before this has neither: its anchor
-- stays as the saved offers prove it, or unavailable, and is never filled in here.
ALTER TABLE board_markets ADD COLUMN IF NOT EXISTS pricing_format text;
ALTER TABLE board_markets ADD COLUMN IF NOT EXISTS anchor jsonb;

ALTER TABLE board_markets DROP CONSTRAINT IF EXISTS board_markets_pricing;
ALTER TABLE board_markets ADD CONSTRAINT board_markets_pricing CHECK (
  (pricing_format IS NULL AND anchor IS NULL)
  OR (
    pricing_format = 'paired-anchor-1'
    AND jsonb_typeof(anchor) = 'array'
    AND jsonb_array_length(anchor) = 2
  )
);

-- The anchor pair, its format, and the extra quotes are frozen with the offers.
CREATE OR REPLACE FUNCTION reject_frozen_board_market_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE'
    OR OLD.frozen_at IS NOT NULL
    OR NEW.board_id IS DISTINCT FROM OLD.board_id
    OR NEW.market IS DISTINCT FROM OLD.market
    OR NEW.offers IS DISTINCT FROM OLD.offers
    OR NEW.quotes IS DISTINCT FROM OLD.quotes
    OR NEW.pricing_format IS DISTINCT FROM OLD.pricing_format
    OR NEW.anchor IS DISTINCT FROM OLD.anchor
  THEN
    RAISE EXCEPTION 'frozen % rows are immutable', TG_TABLE_NAME
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
