-- Migration: 048_auth_audit_log
-- Purpose: Authentication event audit log for login/logout tracking
-- LAW Reference: §11.1 (immutable audit), §11.2 (request correlation)

-- ============================================================================
-- AUTH AUDIT LOG (append-only, LAW §11.1)
-- Immutable audit trail for authentication events
-- ============================================================================

CREATE TABLE auth_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Event type
  event_type VARCHAR(50) NOT NULL,  -- 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT'

  -- Context
  facility_id UUID REFERENCES facility(id),  -- NULL for platform admin logins
  user_id UUID REFERENCES app_user(id),      -- NULL for failed logins (user not found)
  username VARCHAR(255) NOT NULL,            -- Attempted username
  user_roles TEXT[],                         -- Roles at time of event (NULL for failed logins)

  -- Result
  success BOOLEAN NOT NULL,
  failure_reason VARCHAR(100),  -- 'user_not_found', 'bad_password', 'account_disabled', 'facility_not_found'

  -- Request correlation (LAW §11.2)
  request_id VARCHAR(100),
  ip_address VARCHAR(50),
  user_agent TEXT,

  -- Timestamp (immutable)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_auth_audit_log_user ON auth_audit_log(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_auth_audit_log_facility ON auth_audit_log(facility_id) WHERE facility_id IS NOT NULL;
CREATE INDEX idx_auth_audit_log_created ON auth_audit_log(created_at DESC);
CREATE INDEX idx_auth_audit_log_event_type ON auth_audit_log(event_type);
CREATE INDEX idx_auth_audit_log_success ON auth_audit_log(success);

-- Protect from modification (append-only, LAW §11.1)
CREATE TRIGGER auth_audit_log_no_update
  BEFORE UPDATE ON auth_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER auth_audit_log_no_delete
  BEFORE DELETE ON auth_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

COMMENT ON TABLE auth_audit_log IS 'LAW §11.1: Immutable audit log for authentication events';
COMMENT ON COLUMN auth_audit_log.request_id IS 'LAW §11.2: Correlation ID for incident reconstruction';
COMMENT ON COLUMN auth_audit_log.failure_reason IS 'Reason for failed authentication attempts';
