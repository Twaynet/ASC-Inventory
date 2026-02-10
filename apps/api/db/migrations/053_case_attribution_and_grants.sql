-- Migration: 053_case_attribution_and_grants
-- Purpose: Case-to-organization attribution and cross-org access grants
-- LAW Reference: PHI_ACCESS_AND_RETENTION_LAW — Case Attribution Rules, Covering and Cross-Group Access

-- ============================================================================
-- CASE PRIMARY ORGANIZATION (Attribution)
-- ============================================================================

-- Each case must have exactly one Primary Organization of Record
-- Nullable initially for backward compat; backfilled below
ALTER TABLE surgical_case
  ADD COLUMN primary_organization_id UUID REFERENCES organization(id);

CREATE INDEX idx_case_primary_org ON surgical_case(primary_organization_id)
  WHERE primary_organization_id IS NOT NULL;

-- ============================================================================
-- CASE ATTRIBUTION EVENT LOG (append-only, immutable)
-- ============================================================================

CREATE TABLE case_attribution_event (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES surgical_case(id),
  previous_organization_id UUID REFERENCES organization(id),
  new_organization_id UUID NOT NULL REFERENCES organization(id),
  changed_by_user_id UUID NOT NULL REFERENCES app_user(id),
  justification TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_case_attribution_event_case ON case_attribution_event(case_id);

-- Immutable: prevent update and delete
CREATE TRIGGER case_attribution_event_no_update
  BEFORE UPDATE ON case_attribution_event
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER case_attribution_event_no_delete
  BEFORE DELETE ON case_attribution_event
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

COMMENT ON TABLE case_attribution_event IS 'PHI LAW: Immutable audit trail of case attribution changes';

-- ============================================================================
-- CROSS-ORGANIZATION ACCESS GRANTS
-- Explicit, time-bounded, facility-scoped (Constraint 3)
-- ============================================================================

CREATE TABLE case_access_grant (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  case_id UUID NOT NULL REFERENCES surgical_case(id),
  granted_to_user_id UUID NOT NULL REFERENCES app_user(id),
  granted_by_user_id UUID NOT NULL REFERENCES app_user(id),
  reason VARCHAR(255) NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id UUID REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_access_grant_case ON case_access_grant(case_id);
CREATE INDEX idx_access_grant_facility ON case_access_grant(facility_id);
CREATE INDEX idx_access_grant_user ON case_access_grant(granted_to_user_id)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE case_access_grant IS 'PHI LAW: Explicit, time-bounded cross-org access grants';
COMMENT ON COLUMN case_access_grant.facility_id IS 'Constraint 3: grants are facility-scoped';
COMMENT ON COLUMN case_access_grant.expires_at IS 'Grants expire automatically; no perpetual cross-org access';

-- ============================================================================
-- BACKFILL: Set primary_organization_id for existing cases
-- Default to the facility's ASC organization
-- ============================================================================

UPDATE surgical_case sc
SET primary_organization_id = o.id
FROM organization o
WHERE o.facility_id = sc.facility_id
  AND o.organization_type = 'ASC'
  AND o.is_active = true
  AND sc.primary_organization_id IS NULL;
