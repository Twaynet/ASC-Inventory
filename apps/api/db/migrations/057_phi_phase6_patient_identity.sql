-- Migration: 057_phi_phase6_patient_identity
-- Purpose: PHI Phase 6A — Patient Identity Domain
-- LAW Reference: PHI_PHASE_6_IDENTITY_LAW.md
-- Phase 6 Invariant: Identity data in dedicated PHI tables ONLY.
--   No PHI fields embedded in operational tables.
--   surgical_case references patient by opaque UUID only.

-- ============================================================================
-- 1. PATIENT TABLE (PHI Identity Domain)
-- ============================================================================

CREATE TABLE patient (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id   UUID NOT NULL REFERENCES facility(id),
  mrn           TEXT NOT NULL,               -- Medical Record Number (facility-scoped)
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Facility-scoped MRN uniqueness (LAW §Data Model Rule 3)
  CONSTRAINT uq_patient_facility_mrn UNIQUE (facility_id, mrn)
);

COMMENT ON TABLE patient IS
  'PHI Phase 6A: Patient identity records. PHI data — access requires PHI_CLINICAL_ACCESS capability.';

COMMENT ON COLUMN patient.mrn IS
  'Medical Record Number, unique per facility. This is PHI.';

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

-- Lookup by facility + MRN (covered by unique constraint, but explicit for clarity)
-- The unique constraint already creates this index.

-- Lookup by facility + last name for search
CREATE INDEX idx_patient_facility_name
  ON patient(facility_id, last_name, first_name);

-- ============================================================================
-- 3. UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_patient_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patient_updated_at
  BEFORE UPDATE ON patient
  FOR EACH ROW
  EXECUTE FUNCTION trg_patient_updated_at();

-- ============================================================================
-- 4. FK ON SURGICAL_CASE (opaque reference only — no PHI fields)
-- ============================================================================

ALTER TABLE surgical_case
  ADD COLUMN patient_id UUID REFERENCES patient(id);

COMMENT ON COLUMN surgical_case.patient_id IS
  'Phase 6A: Opaque reference to patient identity. No PHI fields duplicated here.';

CREATE INDEX idx_surgical_case_patient
  ON surgical_case(patient_id)
  WHERE patient_id IS NOT NULL;
