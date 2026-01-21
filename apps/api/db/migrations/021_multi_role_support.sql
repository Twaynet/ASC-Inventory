-- Migration: Add multi-role support for cross-trained ASC staff
-- Users can now hold multiple roles (e.g., SCRUB + INVENTORY_TECH)

-- Add roles array column (nullable initially for migration)
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS roles user_role[] DEFAULT NULL;

-- Populate from existing single role column
UPDATE app_user SET roles = ARRAY[role] WHERE roles IS NULL;

-- Make roles NOT NULL after population
ALTER TABLE app_user ALTER COLUMN roles SET NOT NULL;

-- Set sensible default for new users
ALTER TABLE app_user ALTER COLUMN roles SET DEFAULT ARRAY['CIRCULATOR']::user_role[];

-- Create index for role lookups (using GIN for array contains queries)
CREATE INDEX IF NOT EXISTS idx_user_roles ON app_user USING GIN(roles);

-- Note: Keep the old 'role' column for backward compatibility
-- It can be deprecated in a future migration once all code uses 'roles'
