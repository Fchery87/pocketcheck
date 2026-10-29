-- Extra sportsbook quotes frozen with a board market. Older rows have none, which reads as an
-- empty list. A quote on a different point line is another contract, not a better price.

ALTER TABLE board_markets ADD COLUMN IF NOT EXISTS quotes jsonb NOT NULL DEFAULT '[]'::jsonb;
