-- Missing evidence and caveats found while collecting a run's evidence.
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS gaps jsonb;
