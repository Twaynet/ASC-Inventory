-- Migration 060: Financial Readiness (Phase 2)
--
-- Observational, admin-only financial risk tracking layer.
-- Attaches to surgery_request without coupling. Does NOT block scheduling.
-- No payer APIs, no document storage, no EMR fields.

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE clinic_financial_state AS ENUM (
  'UNKNOWN',
  'DECLARED_CLEARED',
  'DECLARED_AT_RISK'
);

CREATE TYPE asc_financial_state AS ENUM (
  'UNKNOWN',
  'VERIFIED_CLEARED',
  'VERIFIED_AT_RISK'
);

CREATE TYPE override_state AS ENUM (
  'NONE',
  'OVERRIDE_CLEARED',
  'OVERRIDE_AT_RISK'
);

CREATE TYPE financial_risk_state AS ENUM (
  'UNKNOWN',
  'LOW',
  'MEDIUM',
  'HIGH'
);

CREATE TYPE override_reason_code AS ENUM (
  'ADMIN_JUDGMENT',
  'URGENT_CASE',
  'CLINIC_CONFIRMED',
  'PATIENT_PAID',
  'OTHER'
);

-- ============================================================================
-- TABLE: clinic_financial_declaration (append-only)
-- What the clinic reports about financial readiness.
-- Recorded by an ASC admin on behalf of the clinic.
-- ============================================================================

CREATE TABLE clinic_financial_declaration (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  surgery_request_id UUID NOT NULL REFERENCES surgery_request(id) ON DELETE CASCADE,
  state clinic_financial_state NOT NULL,
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  note TEXT,
  actor_clinic_id UUID NOT NULL REFERENCES clinic(id),
  recorded_by_user_id UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE clinic_financial_declaration IS 'Append-only. What the clinic reports about financial readiness for a surgery request.';

CREATE INDEX idx_clinic_financial_declaration_request
  ON clinic_financial_declaration(surgery_request_id);

CREATE TRIGGER clinic_financial_declaration_no_update
  BEFORE UPDATE ON clinic_financial_declaration
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER clinic_financial_declaration_no_delete
  BEFORE DELETE ON clinic_financial_declaration
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- ============================================================================
-- TABLE: asc_financial_verification (append-only)
-- What the ASC independently verifies about financial readiness.
-- ============================================================================

CREATE TABLE asc_financial_verification (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  surgery_request_id UUID NOT NULL REFERENCES surgery_request(id) ON DELETE CASCADE,
  state asc_financial_state NOT NULL,
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  note TEXT,
  verified_by_user_id UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE asc_financial_verification IS 'Append-only. What the ASC verifies about financial readiness for a surgery request.';

CREATE INDEX idx_asc_financial_verification_request
  ON asc_financial_verification(surgery_request_id);

CREATE TRIGGER asc_financial_verification_no_update
  BEFORE UPDATE ON asc_financial_verification
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER asc_financial_verification_no_delete
  BEFORE DELETE ON asc_financial_verification
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- ============================================================================
-- TABLE: financial_override (append-only)
-- Admin overrides of computed financial risk.
-- state=NONE clears a previous override (reason_code must be NULL).
-- ============================================================================

CREATE TABLE financial_override (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  surgery_request_id UUID NOT NULL REFERENCES surgery_request(id) ON DELETE CASCADE,
  state override_state NOT NULL,
  reason_code override_reason_code,
  note TEXT,
  overridden_by_user_id UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_override_reason_code CHECK (
    (state = 'NONE' AND reason_code IS NULL)
    OR (state != 'NONE' AND reason_code IS NOT NULL)
  )
);

COMMENT ON TABLE financial_override IS 'Append-only. Admin overrides of computed financial risk. state=NONE clears override.';

CREATE INDEX idx_financial_override_request
  ON financial_override(surgery_request_id);

CREATE TRIGGER financial_override_no_update
  BEFORE UPDATE ON financial_override
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER financial_override_no_delete
  BEFORE DELETE ON financial_override
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- ============================================================================
-- TABLE: financial_readiness_cache (mutable snapshot)
-- Deterministically recomputed from the append-only event tables.
-- target_facility_id is denormalized for scoping/performance.
-- ============================================================================

CREATE TABLE financial_readiness_cache (
  surgery_request_id UUID PRIMARY KEY REFERENCES surgery_request(id) ON DELETE CASCADE,
  target_facility_id UUID NOT NULL REFERENCES facility(id),
  clinic_state clinic_financial_state NOT NULL DEFAULT 'UNKNOWN',
  asc_state asc_financial_state NOT NULL DEFAULT 'UNKNOWN',
  override_state override_state NOT NULL DEFAULT 'NONE',
  risk_state financial_risk_state NOT NULL DEFAULT 'UNKNOWN',
  last_clinic_declaration_id UUID REFERENCES clinic_financial_declaration(id),
  last_asc_verification_id UUID REFERENCES asc_financial_verification(id),
  last_override_id UUID REFERENCES financial_override(id),
  recomputed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE financial_readiness_cache IS 'Mutable snapshot of computed financial risk state. Recomputed deterministically from append-only event tables.';

CREATE INDEX idx_financial_readiness_cache_facility_risk
  ON financial_readiness_cache(target_facility_id, risk_state, updated_at);

CREATE INDEX idx_financial_readiness_cache_facility_risk_state
  ON financial_readiness_cache(target_facility_id, risk_state);

CREATE TRIGGER financial_readiness_cache_updated_at
  BEFORE UPDATE ON financial_readiness_cache
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
