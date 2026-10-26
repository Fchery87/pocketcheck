-- Frozen primary classification. Chosen when an attempt first reaches a terminal
-- status, from completion order and the pregame cutoff, never from scores.
-- Existing rows stay unclassified: their completion timing was not proven to
-- precede outcome use.
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS assessment_role text;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS assessment_role_reason text;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS primary_analysis_id uuid REFERENCES analyses (id);

ALTER TABLE analyses DROP CONSTRAINT IF EXISTS analyses_assessment_role_known;
ALTER TABLE analyses ADD CONSTRAINT analyses_assessment_role_known CHECK (
  assessment_role IS NULL
  OR (
    assessment_role IN ('primary', 'refresh', 'ineligible')
    AND assessment_role_reason IS NOT NULL
    AND (
      (assessment_role = 'primary' AND primary_analysis_id IS NULL)
      OR (assessment_role = 'refresh' AND primary_analysis_id IS NOT NULL)
      OR (assessment_role = 'ineligible' AND primary_analysis_id IS NULL)
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS analyses_one_primary_per_game
  ON analyses (
    ((snapshot->'game'->>'sourceGameId'))
  )
  WHERE assessment_role = 'primary';
