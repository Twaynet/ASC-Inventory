-- Migration: 058_phi_patient_gender
-- Purpose: PHI Phase 6A.1 — Add gender to patient identity domain
-- LAW Reference: PHI_PHASE_6_IDENTITY_LAW.md (Amendment 1: Gender)
-- Rationale: Gender is part of the minimal patient identity required
--   for safe surgical timeout workflow (patient verification).

-- ============================================================================
-- 1. ADD GENDER COLUMN WITH CHECK CONSTRAINT
-- ============================================================================

ALTER TABLE patient
  ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT 'UNKNOWN';

-- Add check constraint only if it doesn't already exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_patient_gender'
  ) THEN
    ALTER TABLE patient ADD CONSTRAINT chk_patient_gender
      CHECK (gender IN ('MALE', 'FEMALE', 'OTHER', 'UNKNOWN'));
  END IF;
END $$;

COMMENT ON COLUMN patient.gender IS
  'Patient gender for surgical timeout identification. PHI data. Allowed: MALE, FEMALE, OTHER, UNKNOWN.';
