-- Migration: 037_catalog_event
-- Purpose: Append-only audit trail for catalog item changes (images, metadata, etc.)

CREATE TABLE IF NOT EXISTS catalog_event (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  catalog_item_id UUID NOT NULL REFERENCES item_catalog(id),
  action TEXT NOT NULL,  -- IMAGE_ADDED, IMAGE_REMOVED, etc.
  actor_user_id UUID REFERENCES app_user(id),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_catalog_event_item ON catalog_event(catalog_item_id);
CREATE INDEX idx_catalog_event_facility ON catalog_event(facility_id);

-- Append-only protection
CREATE TRIGGER catalog_event_no_update
  BEFORE UPDATE ON catalog_event
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER catalog_event_no_delete
  BEFORE DELETE ON catalog_event
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();
