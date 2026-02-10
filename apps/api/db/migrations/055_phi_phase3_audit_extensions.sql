-- PHI Phase 3: Time-Bound Access, Emergency, Export Controls
-- PHI_TIMEBOUND_ACCESS_AND_EXCEPTION_LAW

-- ============================================================================
-- 1. Emergency columns on phi_access_audit_log
-- ============================================================================
-- ALTER TABLE ADD COLUMN is DDL; existing BEFORE UPDATE/DELETE triggers
-- (prevent_modification) only fire on DML, so this is safe.

ALTER TABLE phi_access_audit_log
  ADD COLUMN is_emergency BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN emergency_justification TEXT;

-- Index for emergency access queries (audit UX filtering)
CREATE INDEX idx_phi_audit_emergency
  ON phi_access_audit_log(is_emergency)
  WHERE is_emergency = true;

-- ============================================================================
-- 2. Separate append-only export audit log (linked to phi_access_audit_log)
-- ============================================================================
-- Keeps export metadata out of the core audit table while maintaining
-- referential integrity. One-to-one: each export generates exactly one
-- phi_access_audit_log entry, and optionally one phi_export_audit_log entry.

CREATE TABLE phi_export_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phi_access_log_id UUID NOT NULL REFERENCES phi_access_audit_log(id),
  export_format VARCHAR(10) NOT NULL,       -- 'csv', 'xlsx', 'json'
  export_row_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_phi_export_audit_access_log
  ON phi_export_audit_log(phi_access_log_id);

CREATE INDEX idx_phi_export_audit_created
  ON phi_export_audit_log(created_at DESC);

-- Immutable (append-only)
CREATE TRIGGER phi_export_audit_log_no_update
  BEFORE UPDATE ON phi_export_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER phi_export_audit_log_no_delete
  BEFORE DELETE ON phi_export_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

COMMENT ON TABLE phi_export_audit_log IS 'PHI LAW Phase 3: Immutable export audit log linked to phi_access_audit_log';
