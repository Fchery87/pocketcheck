-- The private lean, a run's evidence links, actual bets, and settlements are
-- append-only. A settlement is corrected with a new row that names it in
-- corrects_id; nothing already recorded changes or disappears.

CREATE OR REPLACE FUNCTION reject_append_only_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_research_append_only ON user_research;
CREATE TRIGGER user_research_append_only
  BEFORE UPDATE OR DELETE ON user_research
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

DROP TRIGGER IF EXISTS analysis_evidence_append_only ON analysis_evidence;
CREATE TRIGGER analysis_evidence_append_only
  BEFORE UPDATE OR DELETE ON analysis_evidence
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

DROP TRIGGER IF EXISTS bets_append_only ON bets;
CREATE TRIGGER bets_append_only
  BEFORE UPDATE OR DELETE ON bets
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

DROP TRIGGER IF EXISTS settlements_append_only ON settlements;
CREATE TRIGGER settlements_append_only
  BEFORE UPDATE OR DELETE ON settlements
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
