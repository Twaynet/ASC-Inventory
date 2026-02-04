-- Migration: Case PreOp Phase (Part 2)
-- Description: Add PreOp tracking columns and index

-- Add PreOp tracking columns to surgical_case
ALTER TABLE surgical_case
  ADD COLUMN IF NOT EXISTS preop_checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS preop_checked_in_by_user_id UUID REFERENCES app_user(id);

-- Index for efficient filtering of cases in PreOp
CREATE INDEX IF NOT EXISTS idx_case_preop ON surgical_case(facility_id, status) WHERE status = 'IN_PREOP';
