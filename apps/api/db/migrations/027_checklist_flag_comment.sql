-- Migration: Add Flag Comment to Checklist Signatures
-- Allows users to add a comment when flagging for admin review

-- ============================================================================
-- ADD FLAG COMMENT COLUMN
-- ============================================================================

-- Add flag_comment column to store the user's comment when flagging
ALTER TABLE case_checklist_signature
ADD COLUMN flag_comment TEXT;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN case_checklist_signature.flag_comment IS 'Optional comment provided when flagging the signature for admin review';
