-- The placed contract is stored on the bet. Null contract fields stay unknown.
-- They are not filled from the linked research offer.
ALTER TABLE bets ADD COLUMN IF NOT EXISTS submission_id text;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS contract jsonb;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS contract_fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS bets_submission_id_key ON bets (submission_id);
