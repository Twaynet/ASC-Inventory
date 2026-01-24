-- Migration: Checklist Signature Flag for Review
-- Allows users to flag a signature for admin review

-- ============================================================================
-- ADD FLAG COLUMN TO SIGNATURES
-- ============================================================================

-- Add flagged_for_review column to existing signatures table
-- This is set at sign time and is immutable (append-only table)
ALTER TABLE case_checklist_signature
ADD COLUMN flagged_for_review BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- FLAG RESOLUTION TABLE (For ADMIN to clear/resolve flags)
-- ============================================================================

-- Create resolution table to track when admin resolves a flag
-- This maintains immutability of the signature while allowing admin action
CREATE TABLE case_checklist_flag_resolution (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  signature_id UUID NOT NULL REFERENCES case_checklist_signature(id),
  resolved_by_user_id UUID NOT NULL REFERENCES app_user(id),
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Only one resolution per signature (can be cleared once)
  UNIQUE(signature_id)
);

CREATE INDEX idx_flag_resolution_signature ON case_checklist_flag_resolution(signature_id);
CREATE INDEX idx_flag_resolution_resolved_by ON case_checklist_flag_resolution(resolved_by_user_id);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN case_checklist_signature.flagged_for_review IS 'When true, this signature has been flagged for admin review';
COMMENT ON TABLE case_checklist_flag_resolution IS 'Tracks admin resolution of flagged signatures';
