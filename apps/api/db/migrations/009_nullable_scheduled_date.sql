-- Migration: Allow NULL scheduled_date for draft cases
-- Cases are created without a date and scheduled when activated

ALTER TABLE surgical_case ALTER COLUMN scheduled_date DROP NOT NULL;

-- Add comment explaining the workflow
COMMENT ON COLUMN surgical_case.scheduled_date IS 'Set when case is activated. NULL for draft/inactive cases.';
