-- Migration 029: Add admission_types field to surgical_case table
-- Tracks admission type for the case: Outpatient, 23 HR Obs, Admin
-- Multiple types can be selected (stored as JSONB with boolean flags)

ALTER TABLE surgical_case
  ADD COLUMN admission_types JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN surgical_case.admission_types IS 'Admission types for the case: outpatient, twentyThreeHrObs, admin (multiple can be selected)';
