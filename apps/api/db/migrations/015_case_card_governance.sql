-- Case Card Governance Migration
-- Based on spc-governance-workflow.md
--
-- Adds:
-- 1. Soft-lock columns for concurrency control
-- 2. Soft-delete columns for tombstone behavior
-- 3. DELETED status for soft-deleted cards

-- ============================================================================
-- ADD DELETED STATUS TO ENUM
-- ============================================================================

ALTER TYPE case_card_status ADD VALUE IF NOT EXISTS 'DELETED';

-- ============================================================================
-- SOFT-LOCK COLUMNS
-- Purpose: Prevent collisions when multiple users attempt to edit
-- Rules:
-- - When user enters edit mode, soft-lock is applied
-- - While locked: others can view but not save
-- - Lock holder and timestamp visible to viewers
-- - Lock expires after inactivity timeout
-- ============================================================================

ALTER TABLE case_card
  ADD COLUMN IF NOT EXISTS locked_by_user_id UUID REFERENCES app_user(id),
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lock_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_case_card_lock ON case_card(locked_by_user_id) WHERE locked_by_user_id IS NOT NULL;

-- ============================================================================
-- SOFT-DELETE COLUMNS
-- Purpose: Tombstone behavior for deleted cards
-- Rules:
-- - Only OWNER-SURGEON can soft-delete
-- - Card remains in database for integrity/audit
-- - Card is not selectable for new cases
-- - Card accessible in read-only mode for audit/history
-- ============================================================================

ALTER TABLE case_card
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id UUID REFERENCES app_user(id),
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_case_card_deleted ON case_card(facility_id, deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- AUDIT LOG: Add action_type column for better categorization
-- ============================================================================

-- Temporarily disable append-only triggers to allow schema change
ALTER TABLE case_card_edit_log DISABLE TRIGGER case_card_edit_log_no_update;
ALTER TABLE case_card_edit_log DISABLE TRIGGER case_card_edit_log_no_delete;

-- Add action type for clearer audit categorization
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'case_card_edit_log' AND column_name = 'action_type') THEN
    ALTER TABLE case_card_edit_log ADD COLUMN action_type VARCHAR(50);
  END IF;
END $$;

-- Backfill existing records based on change_summary
UPDATE case_card_edit_log
SET action_type = CASE
  WHEN change_summary ILIKE '%created%' THEN 'CREATE'
  WHEN change_summary ILIKE '%activated%' OR change_summary ILIKE '%status changed to ACTIVE%' THEN 'ACTIVATE'
  WHEN change_summary ILIKE '%deprecated%' OR change_summary ILIKE '%status changed to DEPRECATED%' THEN 'DEACTIVATE'
  ELSE 'EDIT'
END
WHERE action_type IS NULL;

-- Re-enable append-only triggers
ALTER TABLE case_card_edit_log ENABLE TRIGGER case_card_edit_log_no_update;
ALTER TABLE case_card_edit_log ENABLE TRIGGER case_card_edit_log_no_delete;

-- ============================================================================
-- HELPER FUNCTION: Check if lock is expired
-- ============================================================================

CREATE OR REPLACE FUNCTION is_case_card_lock_expired(card_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  expires_at TIMESTAMPTZ;
BEGIN
  SELECT lock_expires_at INTO expires_at FROM case_card WHERE id = card_id;
  IF expires_at IS NULL THEN
    RETURN TRUE;
  END IF;
  RETURN NOW() > expires_at;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- HELPER FUNCTION: Clear expired lock
-- ============================================================================

CREATE OR REPLACE FUNCTION clear_expired_case_card_lock(card_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE case_card
  SET locked_by_user_id = NULL, locked_at = NULL, lock_expires_at = NULL
  WHERE id = card_id AND lock_expires_at IS NOT NULL AND NOW() > lock_expires_at;
END;
$$ LANGUAGE plpgsql;
