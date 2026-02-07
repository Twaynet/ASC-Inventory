-- Migration 046: PLATFORM_ADMIN Constraints (Part 2)
-- Implements LAW §3.1-3.2: PLATFORM_ADMIN is a no-tenant identity
--
-- This migration:
-- 1. Makes facility_id nullable
-- 2. Adds constraint enforcing facility_id rules by role
-- 3. Adds index for platform admin queries
--
-- Must run after 045 so PLATFORM_ADMIN enum value is committed.

-- Step 1: Make facility_id nullable for PLATFORM_ADMIN users
ALTER TABLE app_user ALTER COLUMN facility_id DROP NOT NULL;

-- Step 2: Add constraint ensuring facility_id rules per LAW §3.1-3.2
-- PLATFORM_ADMIN: facility_id MUST be NULL (no-tenant identity)
-- All other roles: facility_id MUST NOT be NULL (tenant-scoped)
ALTER TABLE app_user ADD CONSTRAINT chk_facility_id_by_role CHECK (
  (facility_id IS NULL AND 'PLATFORM_ADMIN' = ANY(roles)) OR
  (facility_id IS NOT NULL AND NOT ('PLATFORM_ADMIN' = ANY(roles)))
);

-- Step 3: Add index for platform admin queries
CREATE INDEX idx_app_user_platform_admin ON app_user ((1))
  WHERE 'PLATFORM_ADMIN' = ANY(roles);

-- Add documentation
COMMENT ON CONSTRAINT chk_facility_id_by_role ON app_user IS
  'LAW §3.1-3.2: PLATFORM_ADMIN is no-tenant identity (facility_id NULL); all others require facility';
