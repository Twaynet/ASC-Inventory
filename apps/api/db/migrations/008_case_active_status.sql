-- Migration: Case Active/Inactive Workflow
-- Add active/cancelled tracking for surgical cases

-- Add active/cancelled columns
ALTER TABLE surgical_case ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE surgical_case ADD COLUMN activated_at TIMESTAMPTZ;
ALTER TABLE surgical_case ADD COLUMN activated_by_user_id UUID REFERENCES app_user(id);
ALTER TABLE surgical_case ADD COLUMN is_cancelled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE surgical_case ADD COLUMN cancelled_at TIMESTAMPTZ;
ALTER TABLE surgical_case ADD COLUMN cancelled_by_user_id UUID REFERENCES app_user(id);

-- Backfill existing data: mark non-draft/non-cancelled cases as active
UPDATE surgical_case
SET is_active = true, activated_at = updated_at
WHERE status NOT IN ('DRAFT', 'CANCELLED');

-- Backfill cancelled cases
UPDATE surgical_case
SET is_cancelled = true, cancelled_at = updated_at
WHERE status = 'CANCELLED';

-- Add index for filtering by active status
CREATE INDEX idx_case_active ON surgical_case(facility_id, is_active);

-- Add index for finding cancelled cases
CREATE INDEX idx_case_cancelled ON surgical_case(facility_id, is_cancelled);
