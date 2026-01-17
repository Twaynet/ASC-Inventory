-- Case Card Schema Migration
-- Based on case-card-spec.md v1.0
--
-- Case cards are versioned templates for surgical procedures
-- RULE: Only ONE Active version per Procedure + Surgeon + Facility
-- RULE: Edit log is APPEND-ONLY

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE case_card_status AS ENUM (
  'DRAFT',
  'ACTIVE',
  'DEPRECATED'
);

CREATE TYPE case_type AS ENUM (
  'ELECTIVE',
  'ADD_ON',
  'TRAUMA',
  'REVISION'
);

-- ============================================================================
-- CASE CARD TABLE
-- ============================================================================

CREATE TABLE case_card (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  surgeon_id UUID NOT NULL REFERENCES app_user(id),

  -- Header Information
  procedure_name VARCHAR(255) NOT NULL,
  procedure_codes TEXT[], -- CPT and/or internal codes
  case_type case_type NOT NULL DEFAULT 'ELECTIVE',
  default_duration_minutes INT, -- Estimated skin-to-skin time
  turnover_notes TEXT,

  -- Version Control
  status case_card_status NOT NULL DEFAULT 'DRAFT',
  version_major INT NOT NULL DEFAULT 1,
  version_minor INT NOT NULL DEFAULT 0,
  version_patch INT NOT NULL DEFAULT 0,
  current_version_id UUID, -- FK added after version table

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID NOT NULL REFERENCES app_user(id),

  -- Constraint: Only ONE Active version per Procedure + Surgeon + Facility
  CONSTRAINT unique_active_card UNIQUE (facility_id, surgeon_id, procedure_name)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_case_card_facility ON case_card(facility_id);
CREATE INDEX idx_case_card_surgeon ON case_card(surgeon_id);
CREATE INDEX idx_case_card_status ON case_card(facility_id, status);
CREATE INDEX idx_case_card_procedure ON case_card(facility_id, procedure_name);

-- ============================================================================
-- CASE CARD VERSION (Immutable Snapshots)
-- ============================================================================

CREATE TABLE case_card_version (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_card_id UUID NOT NULL REFERENCES case_card(id),
  version_number VARCHAR(20) NOT NULL, -- Semantic: MAJOR.MINOR.PATCH

  -- Complete snapshot of all data (JSONB for flexibility)
  header_info JSONB NOT NULL DEFAULT '{}',
  patient_flags JSONB NOT NULL DEFAULT '{}',
  instrumentation JSONB NOT NULL DEFAULT '{}',
  equipment JSONB NOT NULL DEFAULT '{}',
  supplies JSONB NOT NULL DEFAULT '{}',
  medications JSONB NOT NULL DEFAULT '{}',
  setup_positioning JSONB NOT NULL DEFAULT '{}',
  surgeon_notes JSONB NOT NULL DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID NOT NULL REFERENCES app_user(id),

  UNIQUE(case_card_id, version_number)
);

CREATE INDEX idx_case_card_version_card ON case_card_version(case_card_id);

-- Add FK for current_version_id
ALTER TABLE case_card
  ADD CONSTRAINT fk_case_card_current_version
  FOREIGN KEY (current_version_id) REFERENCES case_card_version(id);

-- ============================================================================
-- CASE CARD EDIT LOG (Append-Only)
-- ============================================================================

CREATE TABLE case_card_edit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_card_id UUID NOT NULL REFERENCES case_card(id),
  facility_id UUID NOT NULL REFERENCES facility(id),

  -- Edit details
  editor_user_id UUID NOT NULL REFERENCES app_user(id),
  editor_name VARCHAR(255) NOT NULL,
  editor_role user_role NOT NULL,
  change_summary TEXT NOT NULL,
  reason_for_change TEXT,

  -- Version info
  previous_version_id UUID REFERENCES case_card_version(id),
  new_version_id UUID REFERENCES case_card_version(id),

  -- Metadata
  edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No UPDATE or DELETE on edit log
CREATE INDEX idx_case_card_edit_log_card ON case_card_edit_log(case_card_id);
CREATE INDEX idx_case_card_edit_log_facility ON case_card_edit_log(facility_id);
CREATE INDEX idx_case_card_edit_log_editor ON case_card_edit_log(editor_user_id);
CREATE INDEX idx_case_card_edit_log_date ON case_card_edit_log(edited_at DESC);

-- ============================================================================
-- CASE COMPLETION FEEDBACK (Optional, linked to surgical_case)
-- ============================================================================

CREATE TABLE case_card_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_card_id UUID NOT NULL REFERENCES case_card(id),
  surgical_case_id UUID NOT NULL REFERENCES surgical_case(id),
  facility_id UUID NOT NULL REFERENCES facility(id),

  -- Feedback data
  items_unused JSONB DEFAULT '[]',
  items_missing JSONB DEFAULT '[]',
  setup_issues TEXT,
  staff_comments TEXT,
  suggested_edits TEXT,

  -- Metadata
  submitted_by_user_id UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_case_card_feedback_card ON case_card_feedback(case_card_id);
CREATE INDEX idx_case_card_feedback_case ON case_card_feedback(surgical_case_id);

-- ============================================================================
-- PROTECTION: Prevent modifications to append-only edit log
-- ============================================================================

CREATE TRIGGER case_card_edit_log_no_update
  BEFORE UPDATE ON case_card_edit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER case_card_edit_log_no_delete
  BEFORE DELETE ON case_card_edit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- ============================================================================
-- UPDATED_AT TRIGGER for case_card
-- ============================================================================

CREATE TRIGGER case_card_updated_at BEFORE UPDATE ON case_card
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
