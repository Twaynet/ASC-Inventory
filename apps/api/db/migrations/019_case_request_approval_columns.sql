-- Migration: Case Request/Approval Workflow - Part 2
-- Description: Add requested date/time fields, rejection tracking, and indexes

-- Add requested date/time columns (user's preferred scheduling)
ALTER TABLE surgical_case
  ADD COLUMN requested_date DATE,
  ADD COLUMN requested_time TIME;

-- Add rejection tracking columns
ALTER TABLE surgical_case
  ADD COLUMN rejected_at TIMESTAMPTZ,
  ADD COLUMN rejected_by_user_id UUID REFERENCES app_user(id),
  ADD COLUMN rejection_reason TEXT;

-- Add indexes for filtering
CREATE INDEX idx_case_requested_status
  ON surgical_case(facility_id, status)
  WHERE status = 'REQUESTED';

CREATE INDEX idx_case_rejected_status
  ON surgical_case(facility_id, status)
  WHERE status = 'REJECTED';

-- Add helpful comments
COMMENT ON COLUMN surgical_case.requested_date IS 'User-requested preferred date (optional reference)';
COMMENT ON COLUMN surgical_case.requested_time IS 'User-requested preferred time (optional reference)';
COMMENT ON COLUMN surgical_case.scheduled_date IS 'Admin/Scheduler-assigned scheduled date (required for activation)';
COMMENT ON COLUMN surgical_case.scheduled_time IS 'Admin/Scheduler-assigned scheduled time (optional)';
