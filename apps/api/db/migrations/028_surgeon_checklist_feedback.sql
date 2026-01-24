-- Migration: Surgeon Checklist Feedback
-- Allows surgeons to add notes and flag checklists for admin review after completion

-- ============================================================================
-- ADD SURGEON FEEDBACK COLUMNS TO CHECKLIST INSTANCE
-- ============================================================================

-- Add surgeon feedback columns
ALTER TABLE case_checklist_instance
ADD COLUMN surgeon_notes TEXT,
ADD COLUMN surgeon_flagged BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN surgeon_flagged_at TIMESTAMPTZ,
ADD COLUMN surgeon_flagged_comment TEXT;

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index for finding flagged checklists
CREATE INDEX idx_case_checklist_instance_surgeon_flagged
ON case_checklist_instance(facility_id, surgeon_flagged)
WHERE surgeon_flagged = true;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN case_checklist_instance.surgeon_notes IS 'Notes added by the surgeon after checklist completion';
COMMENT ON COLUMN case_checklist_instance.surgeon_flagged IS 'Whether the surgeon has flagged this checklist for admin review';
COMMENT ON COLUMN case_checklist_instance.surgeon_flagged_at IS 'When the surgeon flagged this checklist';
COMMENT ON COLUMN case_checklist_instance.surgeon_flagged_comment IS 'Comment from surgeon when flagging for review';
