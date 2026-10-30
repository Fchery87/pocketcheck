CREATE TABLE protocol_registrations (
  id text PRIMARY KEY,
  payload jsonb NOT NULL
);

CREATE TABLE closing_market_snapshots (
  id text PRIMARY KEY,
  payload jsonb NOT NULL
);
