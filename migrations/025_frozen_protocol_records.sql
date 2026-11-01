-- Protocol registrations and closing market snapshots are frozen evidence: append-only, like the
-- other journal records. A board's registration reference becomes a restrictive foreign key.
-- A board that already names a missing registration stops this migration with its identifiers.
-- The migration never deletes or rewrites that reference and never invents the registration.
DO $$
DECLARE
  dangling text;
BEGIN
  SELECT string_agg(b.id::text || ' names ' || b.protocol_registration_id, ', ' ORDER BY b.id)
    INTO dangling
    FROM game_boards b
    LEFT JOIN protocol_registrations r ON r.id = b.protocol_registration_id
   WHERE b.protocol_registration_id IS NOT NULL AND r.id IS NULL;
  IF dangling IS NOT NULL THEN
    RAISE EXCEPTION 'Game boards name missing protocol registrations: %', dangling;
  END IF;
END $$;

ALTER TABLE game_boards DROP CONSTRAINT IF EXISTS game_boards_protocol_registration_fk;
ALTER TABLE game_boards ADD CONSTRAINT game_boards_protocol_registration_fk
  FOREIGN KEY (protocol_registration_id) REFERENCES protocol_registrations (id)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS protocol_registrations_append_only ON protocol_registrations;
CREATE TRIGGER protocol_registrations_append_only
  BEFORE UPDATE OR DELETE ON protocol_registrations
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

DROP TRIGGER IF EXISTS closing_market_snapshots_append_only ON closing_market_snapshots;
CREATE TRIGGER closing_market_snapshots_append_only
  BEFORE UPDATE OR DELETE ON closing_market_snapshots
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
