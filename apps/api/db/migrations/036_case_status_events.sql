-- 036_case_status_events.sql
-- Append-only audit trail for surgical_case.status transitions.
-- Uses the existing prevent_modification() trigger function from 001_initial_schema.sql.

CREATE TABLE IF NOT EXISTS surgical_case_status_event (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  surgical_case_id  UUID REFERENCES surgical_case(id),
  from_status       TEXT,                              -- NULL on initial creation
  to_status         TEXT NOT NULL,
  reason            TEXT,                              -- optional human-readable reason
  context           JSONB NOT NULL DEFAULT '{}'::jsonb, -- structured metadata (source, checklistId, ip, etc.)
  actor_user_id     UUID REFERENCES app_user(id),      -- NULL only when system-initiated
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient per-case timeline queries
CREATE INDEX idx_case_status_event_case ON surgical_case_status_event(surgical_case_id, created_at);

-- Append-only protection: reuse the shared prevent_modification() function
CREATE TRIGGER case_status_event_no_update
  BEFORE UPDATE ON surgical_case_status_event
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER case_status_event_no_delete
  BEFORE DELETE ON surgical_case_status_event
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();
