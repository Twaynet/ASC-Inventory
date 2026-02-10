-- Migration: 052_user_organization_affiliation
-- Purpose: Track user membership in organizations for PHI access scoping
-- LAW Reference: PHI_ACCESS_AND_RETENTION_LAW — Affiliation

-- ============================================================================
-- AFFILIATION TYPE ENUM
-- ============================================================================

CREATE TYPE affiliation_type AS ENUM ('PRIMARY', 'SECONDARY');

-- ============================================================================
-- USER-ORGANIZATION AFFILIATION TABLE
-- ============================================================================

CREATE TABLE user_organization_affiliation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES app_user(id),
  organization_id UUID NOT NULL REFERENCES organization(id),
  affiliation_type affiliation_type NOT NULL DEFAULT 'PRIMARY',
  is_active BOOLEAN NOT NULL DEFAULT true,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by_user_id UUID REFERENCES app_user(id),
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id UUID REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique: one active affiliation per user-org pair
CREATE UNIQUE INDEX idx_unique_active_affiliation
  ON user_organization_affiliation(user_id, organization_id)
  WHERE is_active = true;

-- Indexes for common query patterns
CREATE INDEX idx_affiliation_user ON user_organization_affiliation(user_id)
  WHERE is_active = true;
CREATE INDEX idx_affiliation_org ON user_organization_affiliation(organization_id)
  WHERE is_active = true;

COMMENT ON TABLE user_organization_affiliation IS 'PHI LAW: Recorded relationship between users and organizations';
COMMENT ON COLUMN user_organization_affiliation.is_active IS 'Soft-delete; revoked affiliations retain history';
COMMENT ON COLUMN user_organization_affiliation.granted_by_user_id IS 'Who granted this affiliation (audit trail)';

-- ============================================================================
-- BACKFILL: Affiliate all existing users with their facility's ASC org
-- ============================================================================

INSERT INTO user_organization_affiliation (user_id, organization_id, affiliation_type, granted_at)
SELECT u.id, o.id, 'PRIMARY', NOW()
FROM app_user u
JOIN organization o ON o.facility_id = u.facility_id AND o.organization_type = 'ASC'
WHERE u.facility_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_organization_affiliation
    WHERE user_id = u.id AND organization_id = o.id AND is_active = true
  );
