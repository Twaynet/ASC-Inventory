-- Migration: Make roles[] the single canonical authorization column.
-- Backfill gaps, add CHECK constraint, deprecate role column.
--
-- After this migration:
--   - roles[] is guaranteed non-empty for every user
--   - role (singular) is deprecated metadata only
--   - Authorization code reads roles[] exclusively

-- Step 1: Backfill roles[] from role where NULL or empty
UPDATE app_user
SET roles = ARRAY[role]
WHERE roles IS NULL
   OR array_length(roles, 1) IS NULL
   OR array_length(roles, 1) = 0;

-- Step 2: CHECK constraint — roles[] must always be non-empty
ALTER TABLE app_user
ADD CONSTRAINT chk_roles_nonempty
CHECK (array_length(roles, 1) >= 1);

-- Step 3: Mark role column as deprecated via comment
COMMENT ON COLUMN app_user.role IS
  'DEPRECATED: Authorization reads roles[] only. This column is kept for backward compatibility and will be dropped in a future migration.';
