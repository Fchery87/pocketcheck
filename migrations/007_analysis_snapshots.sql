-- Each analysis owns the game and research offer details shown by its report.
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS snapshot jsonb;

-- Existing game rows are mutable schedule records, so these reconstructed values
-- are frozen only as legacy references and must not be presented as originals.
DROP TRIGGER IF EXISTS analyses_completed_immutable ON analyses;

UPDATE analyses AS a
SET snapshot = jsonb_build_object(
  'version', 1,
  'provenance', 'legacy-unknown',
  'game', jsonb_build_object(
    'id', g.id,
    'sourceGameId', g.source_game_id,
    'season', g.season,
    'week', g.week,
    'awayTeam', g.away_team,
    'homeTeam', g.home_team,
    'kickoffAt', g.kickoff_at,
    'venue', g.venue,
    'status', g.status
  ),
  'offer', jsonb_build_object(
    'id', o.id,
    'gameId', o.game_id,
    'sportsbook', o.sportsbook,
    'market', o.market,
    'selection', o.selection,
    'pointLine', o.point_line,
    'americanOdds', o.american_odds,
    'decimalOdds', o.decimal_odds,
    'observedAt', o.observed_at,
    'enteredAt', o.entered_at,
    'kickoffAt', o.kickoff_at,
    'rules', o.rules,
    'opposing', o.opposing,
    'completedAt', o.completed_at
  )
)
FROM offers AS o
JOIN games AS g ON g.id = o.game_id
WHERE o.id = a.offer_id AND a.snapshot IS NULL;

ALTER TABLE analyses ALTER COLUMN snapshot SET NOT NULL;

CREATE TRIGGER analyses_completed_immutable
  BEFORE UPDATE OR DELETE ON analyses
  FOR EACH ROW EXECUTE FUNCTION reject_completed_mutation();
