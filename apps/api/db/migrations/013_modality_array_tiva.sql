-- Migration: Change anesthesia modality to array and add TIVA
-- Modality should support multiple selections (e.g., GENERAL + TIVA)

-- Add TIVA to the enum
ALTER TYPE anesthesia_modality ADD VALUE IF NOT EXISTS 'TIVA';

-- Change modality column to array
ALTER TABLE case_anesthesia_plan
  ALTER COLUMN modality TYPE anesthesia_modality[]
  USING CASE
    WHEN modality IS NULL THEN NULL
    ELSE ARRAY[modality]
  END;

-- Rename column for clarity
ALTER TABLE case_anesthesia_plan
  RENAME COLUMN modality TO modalities;

COMMENT ON COLUMN case_anesthesia_plan.modalities IS 'Array of anesthesia modalities - multiple may be selected';
