-- Migration: Drop patient_mrn column from surgical_case table
-- Removing patient MRN to ensure HIPAA compliance

ALTER TABLE surgical_case DROP COLUMN IF EXISTS patient_mrn;

COMMENT ON TABLE surgical_case IS 'Surgical case record. patient_mrn removed for HIPAA compliance.';
