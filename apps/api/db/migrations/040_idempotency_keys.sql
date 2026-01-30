-- Idempotency key storage for safe write retries.
-- Keys are scoped to (user, facility, method, path) and expire after 24 hours.

CREATE TABLE idempotency_key (
  key TEXT NOT NULL,
  user_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  PRIMARY KEY (key, user_id, facility_id, method, path)
);

CREATE INDEX idx_idempotency_key_expires ON idempotency_key (expires_at);
