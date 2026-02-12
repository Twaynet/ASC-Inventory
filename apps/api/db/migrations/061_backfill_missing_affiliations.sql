-- Migration: 061_backfill_missing_affiliations
-- Purpose: Backfill organizational affiliations for users created after migration 052
-- Context: Migration 052 backfilled existing users, but users created after that
--          (including seeded users and users onboarded via POST /users) were missed.
--          The user creation route now auto-affiliates, so this catches the gap.

INSERT INTO user_organization_affiliation (user_id, organization_id, affiliation_type, granted_at)
SELECT u.id, o.id, 'PRIMARY', NOW()
FROM app_user u
JOIN organization o ON o.facility_id = u.facility_id AND o.organization_type = 'ASC'
WHERE u.facility_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_organization_affiliation
    WHERE user_id = u.id AND organization_id = o.id AND is_active = true
  );
