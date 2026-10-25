-- Store each research run completely enough to show it again unchanged:
-- the policy decision and progress, the validated report, the packet's own
-- evidence ids in packet order, and the sportsbook on an actual bet.
-- Additive only. Existing rows keep NULL in the new columns.

ALTER TABLE analyses ADD COLUMN IF NOT EXISTS policy jsonb;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS stages jsonb;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS body jsonb;

ALTER TABLE evidence ADD COLUMN IF NOT EXISTS packet_item_id text;
ALTER TABLE analysis_evidence ADD COLUMN IF NOT EXISTS position integer;

ALTER TABLE bets ADD COLUMN IF NOT EXISTS sportsbook text;
