ALTER TABLE game_boards ADD COLUMN explanation_format_version smallint
  CHECK (explanation_format_version IS NULL OR explanation_format_version = 2);
