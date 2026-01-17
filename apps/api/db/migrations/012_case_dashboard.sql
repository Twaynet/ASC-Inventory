-- Case Dashboard Schema Migration
-- Based on case-dashboard.md v1.0
--
-- The Case Dashboard is the authoritative workspace for a single scheduled surgical case
-- RULE: Case Dashboard is the only place to Attest/Void readiness
-- RULE: Case Card is a template; instance overrides must not modify the template
-- RULE: No patient-identifiable data allowed
-- RULE: Event log is APPEND-ONLY

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE anesthesia_modality AS ENUM (
  'GENERAL',
  'SPINAL',
  'REGIONAL',
  'MAC',
  'LOCAL'
);

CREATE TYPE attestation_state AS ENUM (
  'NOT_ATTESTED',
  'ATTESTED',
  'VOIDED'
);

CREATE TYPE case_event_type AS ENUM (
  'CASE_CARD_LINKED',
  'CASE_CARD_CHANGED',
  'READINESS_ATTESTED',
  'READINESS_VOIDED',
  'OVERRIDE_ADDED',
  'OVERRIDE_MODIFIED',
  'OVERRIDE_REMOVED',
  'SCHEDULING_CHANGED',
  'ANESTHESIA_PLAN_CHANGED',
  'CASE_CREATED',
  'CASE_ACTIVATED',
  'CASE_CANCELLED'
);

-- ============================================================================
-- UPDATE SURGICAL_CASE TABLE
-- ============================================================================

-- Add link to case card version
ALTER TABLE surgical_case
  ADD COLUMN case_card_version_id UUID REFERENCES case_card_version(id);

-- Add attestation state for quick access (derived from attestation table)
ALTER TABLE surgical_case
  ADD COLUMN attestation_state attestation_state NOT NULL DEFAULT 'NOT_ATTESTED';

-- Add void reason (when attestation is voided)
ALTER TABLE surgical_case
  ADD COLUMN attestation_void_reason TEXT;

-- Add estimated duration (from case card or override)
ALTER TABLE surgical_case
  ADD COLUMN estimated_duration_minutes INT;

-- Add laterality
ALTER TABLE surgical_case
  ADD COLUMN laterality VARCHAR(50);

-- Add OR room assignment
ALTER TABLE surgical_case
  ADD COLUMN or_room VARCHAR(50);

-- Add scheduler notes (non-PHI)
ALTER TABLE surgical_case
  ADD COLUMN scheduler_notes TEXT;

-- Index for attestation state filtering
CREATE INDEX idx_case_attestation_state ON surgical_case(facility_id, attestation_state);

-- Index for case card version lookup
CREATE INDEX idx_case_card_version ON surgical_case(case_card_version_id) WHERE case_card_version_id IS NOT NULL;

-- ============================================================================
-- CASE ANESTHESIA PLAN TABLE
-- ============================================================================

CREATE TABLE case_anesthesia_plan (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES surgical_case(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES facility(id),

  -- Anesthesia fields
  modality anesthesia_modality,
  positioning_considerations TEXT,
  airway_notes TEXT,
  anticoagulation_considerations TEXT, -- Non-PHI phrasing only

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One plan per case
  UNIQUE(case_id)
);

CREATE INDEX idx_anesthesia_plan_case ON case_anesthesia_plan(case_id);
CREATE INDEX idx_anesthesia_plan_facility ON case_anesthesia_plan(facility_id);

-- Updated_at trigger
CREATE TRIGGER case_anesthesia_plan_updated_at BEFORE UPDATE ON case_anesthesia_plan
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- CASE OVERRIDE TABLE
-- ============================================================================

CREATE TABLE case_override (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES surgical_case(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES facility(id),

  -- Override details
  override_target VARCHAR(255) NOT NULL, -- What is being overridden (e.g., "instrumentation.primaryTrays")
  original_value TEXT, -- Original value from case card
  override_value TEXT NOT NULL, -- New value for this case
  reason TEXT NOT NULL, -- Required reason for override

  -- Audit
  created_by_user_id UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Reversion tracking
  reverted_at TIMESTAMPTZ,
  reverted_by_user_id UUID REFERENCES app_user(id)
);

CREATE INDEX idx_override_case ON case_override(case_id);
CREATE INDEX idx_override_facility ON case_override(facility_id);
CREATE INDEX idx_override_active ON case_override(case_id) WHERE reverted_at IS NULL;

-- Updated_at trigger
CREATE TRIGGER case_override_updated_at BEFORE UPDATE ON case_override
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- CASE EVENT LOG TABLE (APPEND-ONLY)
-- ============================================================================

CREATE TABLE case_event_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES surgical_case(id),
  facility_id UUID NOT NULL REFERENCES facility(id),

  -- Event details
  event_type case_event_type NOT NULL,
  user_id UUID NOT NULL REFERENCES app_user(id),
  user_role user_role NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,

  -- Optional references
  override_id UUID REFERENCES case_override(id),
  case_card_version_id UUID REFERENCES case_card_version(id),

  -- Metadata (immutable)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_case_event_log_case ON case_event_log(case_id);
CREATE INDEX idx_case_event_log_facility ON case_event_log(facility_id);
CREATE INDEX idx_case_event_log_type ON case_event_log(case_id, event_type);
CREATE INDEX idx_case_event_log_date ON case_event_log(created_at DESC);

-- ============================================================================
-- PROTECTION: Append-only for case_event_log
-- ============================================================================

CREATE TRIGGER case_event_log_no_update
  BEFORE UPDATE ON case_event_log
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER case_event_log_no_delete
  BEFORE DELETE ON case_event_log
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE case_anesthesia_plan IS 'Case-instance anesthesia plan data. Not part of Case Card template.';
COMMENT ON TABLE case_override IS 'Case-specific overrides that modify template behavior for this case only.';
COMMENT ON TABLE case_event_log IS 'Chronological, append-only audit log for case dashboard actions.';

COMMENT ON COLUMN surgical_case.case_card_version_id IS 'Link to the specific Case Card version used for this case.';
COMMENT ON COLUMN surgical_case.attestation_state IS 'Current attestation state: NOT_ATTESTED, ATTESTED, or VOIDED.';
COMMENT ON COLUMN surgical_case.attestation_void_reason IS 'Reason provided when attestation was voided.';
