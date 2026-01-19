-- Migration 016: Add case-specific fields to surgical_case table
-- These fields are specific to each case instance, not part of the SPC template
-- Per LAW_NOMENCLATURE.md: SPCs are surgeon defaults, Case Cards are case-specific

-- Add case-specific columns
ALTER TABLE surgical_case
  ADD COLUMN case_type VARCHAR(50) DEFAULT 'ELECTIVE',
  ADD COLUMN procedure_codes TEXT[],
  ADD COLUMN patient_flags JSONB DEFAULT '{}'::jsonb;

-- Create index for case type filtering
CREATE INDEX idx_surgical_case_type ON surgical_case(facility_id, case_type);

-- Add comments for clarity
COMMENT ON COLUMN surgical_case.case_type IS 'Type of case: ELECTIVE, ADD_ON, TRAUMA, or REVISION';
COMMENT ON COLUMN surgical_case.procedure_codes IS 'CPT procedure codes for this specific case instance';
COMMENT ON COLUMN surgical_case.patient_flags IS 'Patient-specific non-PHI flags (latex allergy, iodine allergy, nickel-free, anticoagulation, infection risk, neuromonitoring required)';
