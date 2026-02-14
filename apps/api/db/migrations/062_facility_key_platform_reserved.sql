-- Migration: 062_facility_key_platform_reserved
-- Purpose: Hard-lock the PLATFORM invariant at the database level.
--          "PLATFORM" is a reserved login key for the non-tenant control plane.
--          It must never exist as a facility row.

-- Step 1: Fail-safe — abort if a rogue PLATFORM facility row exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM facility WHERE facility_key = 'PLATFORM') THEN
    RAISE EXCEPTION
      'MIGRATION BLOCKED: facility row with facility_key=''PLATFORM'' exists. '
      'This violates the platform invariant. Remove or rename the row before retrying.';
  END IF;
END $$;

-- Step 2: Add CHECK constraint (idempotent — skip if already present).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'facility_key_not_reserved'
  ) THEN
    ALTER TABLE facility
      ADD CONSTRAINT facility_key_not_reserved
      CHECK (facility_key <> 'PLATFORM');
  END IF;
END $$;
