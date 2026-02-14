-- Migration 063: Demo Access System
-- Purpose: Instant-access playground for prospects.
--   - demo_access_request  (append-only log of every grant/deny)
--   - demo_account          (mutable lifecycle per demo user)
--   - demo_blocked_email    (email blocklist)
--   - demo_blocked_ip       (IP blocklist)
--   - app_user.is_demo      (flag for downstream checks / UI banner)
--   - facility_settings.is_demo (marks facilities as demo-eligible)

-- ============================================================================
-- 1. app_user.is_demo flag
-- ============================================================================

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN app_user.is_demo IS
  'True for demo playground accounts. Enables UI banner and auth-time expiry enforcement.';

-- ============================================================================
-- 2. facility_settings.is_demo flag
-- ============================================================================

ALTER TABLE facility_settings
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN facility_settings.is_demo IS
  'True for demo facilities. Only demo users may be attached to these facilities via the playground gate.';

-- ============================================================================
-- 3. demo_access_request (APPEND-ONLY LOG)
-- ============================================================================

CREATE TABLE demo_access_request (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email          TEXT        NOT NULL,
  ip_address     TEXT,
  user_agent     TEXT,
  requested_role TEXT,
  requested_profile TEXT,
  outcome        TEXT        NOT NULL CHECK (outcome IN ('GRANTED', 'DENIED')),
  denial_reason  TEXT,
  demo_user_id   UUID        REFERENCES app_user(id),
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_demo_access_request_email_created
  ON demo_access_request (email, created_at);
CREATE INDEX idx_demo_access_request_ip_created
  ON demo_access_request (ip_address, created_at);

-- Append-only protection (consistent with inventory_event, attestation, etc.)
CREATE TRIGGER demo_access_request_no_update
  BEFORE UPDATE ON demo_access_request
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER demo_access_request_no_delete
  BEFORE DELETE ON demo_access_request
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

COMMENT ON TABLE demo_access_request IS
  'Append-only log of every demo access request (grant or denial). Used for sales and abuse review.';

-- ============================================================================
-- 4. demo_account (MUTABLE LIFECYCLE)
-- ============================================================================

CREATE TABLE demo_account (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID        UNIQUE NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  email          TEXT        NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  is_blocked     BOOLEAN     NOT NULL DEFAULT false,
  blocked_reason TEXT,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_demo_account_email ON demo_account (email);
CREATE INDEX idx_demo_account_expires ON demo_account (expires_at);

-- updated_at trigger (consistent with other mutable tables)
CREATE TRIGGER demo_account_updated_at
  BEFORE UPDATE ON demo_account
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE demo_account IS
  'Mutable lifecycle record for each demo user. Tracks expiry, block status, and last login.';

-- ============================================================================
-- 5. demo_blocked_email
-- ============================================================================

CREATE TABLE demo_blocked_email (
  email      TEXT        PRIMARY KEY,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE demo_blocked_email IS
  'Email blocklist for demo access. Checked on every demo request.';

-- ============================================================================
-- 6. demo_blocked_ip
-- ============================================================================

CREATE TABLE demo_blocked_ip (
  ip_address TEXT        PRIMARY KEY,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE demo_blocked_ip IS
  'IP blocklist for demo access. Checked on every demo request.';
