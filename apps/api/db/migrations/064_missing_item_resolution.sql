-- Migration 064: Missing Item Resolution Tracking
--
-- Purpose: Structured resolution lifecycle for missing inventory items.
--   - Adds MISSING_RESOLVED to inventory_event_type enum
--   - Creates missing_item_resolution table (append-only)
--
-- This is additive only. Does NOT modify existing inventory_event rows,
-- availability_status values, or any existing missing-flag patterns.

-- ============================================================================
-- 1. Add MISSING_RESOLVED to inventory_event_type enum
-- ============================================================================

ALTER TYPE inventory_event_type ADD VALUE IF NOT EXISTS 'MISSING_RESOLVED';

-- ============================================================================
-- 2. missing_item_resolution (APPEND-ONLY)
-- ============================================================================

CREATE TABLE missing_item_resolution (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_item_id   UUID        NOT NULL REFERENCES inventory_item(id),
  facility_id         UUID        NOT NULL REFERENCES facility(id),
  resolved_by_user_id UUID        NOT NULL REFERENCES app_user(id),
  resolution_type     TEXT        NOT NULL CHECK (
    resolution_type IN (
      'LOCATED',
      'VENDOR_REPLACEMENT',
      'CASE_RESCHEDULED',
      'INVENTORY_ERROR_CORRECTED',
      'OTHER'
    )
  ),
  resolution_notes    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_missing_resolution_item
  ON missing_item_resolution (inventory_item_id);
CREATE INDEX idx_missing_resolution_facility
  ON missing_item_resolution (facility_id, created_at);

-- Append-only protection (consistent with inventory_event, attestation, etc.)
CREATE TRIGGER missing_item_resolution_no_update
  BEFORE UPDATE ON missing_item_resolution
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER missing_item_resolution_no_delete
  BEFORE DELETE ON missing_item_resolution
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

COMMENT ON TABLE missing_item_resolution IS
  'Append-only resolution records for missing inventory items. '
  'Each row captures who resolved a missing item, how, and when.';
