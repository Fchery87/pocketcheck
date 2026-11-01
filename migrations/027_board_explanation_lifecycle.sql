ALTER TABLE game_boards ADD COLUMN lifecycle_format text CHECK (lifecycle_format = 'forecast-first-v1');

CREATE TABLE board_explanation_events (
  id uuid PRIMARY KEY,
  board_id uuid NOT NULL REFERENCES game_boards(id),
  attempt_id text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  kind text NOT NULL CHECK (kind IN ('started', 'request-intent', 'response', 'completed', 'failed', 'ambiguous')),
  request_id text,
  request_role text CHECK (request_role IN ('original', 'repair')),
  recorded_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  UNIQUE (board_id, sequence)
);
CREATE UNIQUE INDEX board_explanation_start ON board_explanation_events(board_id, attempt_id) WHERE kind = 'started';
CREATE UNIQUE INDEX board_explanation_attempt_identity ON board_explanation_events(attempt_id) WHERE kind = 'started';
CREATE UNIQUE INDEX board_explanation_terminal ON board_explanation_events(board_id, attempt_id) WHERE kind IN ('completed', 'failed', 'ambiguous');
CREATE UNIQUE INDEX board_explanation_phase ON board_explanation_events(board_id, attempt_id, request_role) WHERE kind = 'request-intent';
CREATE UNIQUE INDEX board_explanation_request ON board_explanation_events(request_id) WHERE kind = 'request-intent';
CREATE UNIQUE INDEX board_explanation_response ON board_explanation_events(board_id, attempt_id, request_id) WHERE kind = 'response';
CREATE FUNCTION reject_explanation_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Explanation events are append-only';
END;
$$;
CREATE TRIGGER explanation_events_append_only BEFORE UPDATE OR DELETE ON board_explanation_events FOR EACH ROW EXECUTE FUNCTION reject_explanation_event_mutation();
