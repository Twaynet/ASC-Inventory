-- Migration: 056_phi_phase4_retention_breach
-- Purpose: PHI Phase 4 — Breach readiness metadata, retention config keys, audit analytics indexes
-- LAW Reference: PHI_ACCESS_AND_RETENTION_LAW — Retention & Breach Readiness
-- Phase 4 Invariant: NO DELETES. Retention is advisory only.

-- ============================================================================
-- 1. BREACH CONTEXT COLUMN ON phi_access_audit_log
-- (append-only table — DDL does not fire DML triggers)
-- ============================================================================

ALTER TABLE phi_access_audit_log
  ADD COLUMN breach_context JSONB;

COMMENT ON COLUMN phi_access_audit_log.breach_context IS
  'Phase 4: Hashed request metadata for breach investigation. Fields: ip_hash, user_agent_hash, geo_hint, request_fingerprint. NO raw PII.';

-- ============================================================================
-- 2. INDEXES FOR PHASE 4 QUERIES
-- ============================================================================

-- Breach investigation: find entries with breach_context populated
CREATE INDEX idx_phi_audit_breach_context
  ON phi_access_audit_log(id)
  WHERE breach_context IS NOT NULL;

-- Session grouping: user_id + time ordering for LAG() window function
CREATE INDEX idx_phi_audit_user_session
  ON phi_access_audit_log(user_id, created_at DESC);

-- Excessive denial detection: filtered index for DENIED outcomes
CREATE INDEX idx_phi_audit_denial_detection
  ON phi_access_audit_log(user_id, created_at DESC)
  WHERE outcome = 'DENIED';

-- ============================================================================
-- 3. RETENTION + AUDIT ANALYTICS CONFIG KEYS
-- ============================================================================

INSERT INTO platform_config_key
  (key, value_type, default_value, display_name, description, category, risk_class, is_sensitive, allow_facility_override)
VALUES
  ('phi.retention.billing_years', 'NUMBER', '7',
   'Billing PHI Retention (years)',
   'Minimum years to retain PHI_BILLING data after case completion. LAW: 7-10 years jurisdiction dependent.',
   'phi', 'HIGH', false, true),

  ('phi.retention.audit_years', 'NUMBER', '7',
   'Audit Log Retention (years)',
   'Minimum years to retain PHI audit logs. LAW: at least billing retention period.',
   'phi', 'HIGH', false, true),

  ('phi.retention.clinical_years', 'NUMBER', '7',
   'Clinical PHI Retention (years)',
   'Minimum years to retain PHI_CLINICAL data after case completion. Visibility reduces; retention preserved.',
   'phi', 'HIGH', false, true),

  ('phi.audit.session_gap_minutes', 'NUMBER', '15',
   'Audit Session Gap (minutes)',
   'Maximum gap between sequential PHI accesses to group into one session for audit correlation.',
   'phi', 'MEDIUM', false, false),

  ('phi.audit.excessive_denial_threshold', 'NUMBER', '10',
   'Excessive Denial Threshold',
   'Number of denials per user per hour that triggers suspicious flag in audit analytics.',
   'phi', 'MEDIUM', false, false)

ON CONFLICT (key) DO NOTHING;
