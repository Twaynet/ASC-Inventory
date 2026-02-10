-- Migration: 054_phi_access_audit_log
-- Purpose: Immutable audit log for all PHI access events
-- LAW Reference: PHI_ACCESS_AND_RETENTION_LAW — Logging & Audit Requirements

-- ============================================================================
-- DATABASE ENUMS FOR PHI ACCESS
-- ============================================================================

CREATE TYPE phi_classification AS ENUM ('PHI_CLINICAL', 'PHI_BILLING', 'PHI_AUDIT');
CREATE TYPE access_purpose AS ENUM ('CLINICAL_CARE', 'SCHEDULING', 'BILLING', 'AUDIT', 'EMERGENCY');
CREATE TYPE access_outcome AS ENUM ('ALLOWED', 'DENIED');

-- ============================================================================
-- PHI ACCESS AUDIT LOG (append-only, immutable)
-- Constraint 4: Every PHI access attempt is logged, including malformed
-- ============================================================================

CREATE TABLE phi_access_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Who
  user_id UUID NOT NULL REFERENCES app_user(id),
  user_roles TEXT[] NOT NULL,

  -- Context
  facility_id UUID NOT NULL REFERENCES facility(id),
  organization_ids UUID[] NOT NULL DEFAULT '{}',  -- User's affiliations at time of access

  -- What
  case_id UUID REFERENCES surgical_case(id),
  phi_classification phi_classification NOT NULL,
  access_purpose access_purpose NOT NULL,

  -- Result
  outcome access_outcome NOT NULL,
  denial_reason VARCHAR(255),  -- Populated when outcome = DENIED

  -- Correlation
  request_id VARCHAR(100),
  endpoint VARCHAR(255),
  http_method VARCHAR(10),

  -- Timestamp (immutable)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_phi_audit_user ON phi_access_audit_log(user_id);
CREATE INDEX idx_phi_audit_case ON phi_access_audit_log(case_id) WHERE case_id IS NOT NULL;
CREATE INDEX idx_phi_audit_facility ON phi_access_audit_log(facility_id);
CREATE INDEX idx_phi_audit_created ON phi_access_audit_log(created_at DESC);
CREATE INDEX idx_phi_audit_outcome ON phi_access_audit_log(outcome);
CREATE INDEX idx_phi_audit_classification ON phi_access_audit_log(phi_classification);

-- Immutable: prevent update and delete (Constraint 4)
CREATE TRIGGER phi_access_audit_log_no_update
  BEFORE UPDATE ON phi_access_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER phi_access_audit_log_no_delete
  BEFORE DELETE ON phi_access_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

COMMENT ON TABLE phi_access_audit_log IS 'PHI LAW: Immutable audit log for all PHI access events';
COMMENT ON COLUMN phi_access_audit_log.organization_ids IS 'User org affiliations at time of access (snapshot)';
COMMENT ON COLUMN phi_access_audit_log.denial_reason IS 'Reason for DENIED outcome; NULL when ALLOWED';
COMMENT ON COLUMN phi_access_audit_log.request_id IS 'Request correlation ID for incident reconstruction';
