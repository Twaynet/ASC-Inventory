-- Surgery Request: Phase 1 Readiness Core
-- Clinics PUSH structured readiness data into the ASC hub.
-- ASC reviews, then converts accepted requests into surgical_case records.
-- This is operational governance only — no financial/insurance/EMR fields.

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE surgery_request_status AS ENUM (
  'SUBMITTED',
  'RETURNED_TO_CLINIC',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'CONVERTED'
);

CREATE TYPE surgery_request_event_type AS ENUM (
  'SUBMITTED',
  'RESUBMITTED',
  'RETURNED',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'CONVERTED'
);

CREATE TYPE surgery_request_surgery_request_checklist_status AS ENUM (
  'PENDING',
  'COMPLETE'
);

CREATE TYPE surgery_request_actor_type AS ENUM (
  'CLINIC',
  'ASC'
);

-- ============================================================================
-- TABLE: clinic (source tenant)
-- ============================================================================

CREATE TABLE clinic (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  clinic_key TEXT UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE clinic IS 'Source tenant — clinics that push surgery requests to ASC facilities.';

CREATE TRIGGER clinic_updated_at BEFORE UPDATE ON clinic
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- TABLE: clinic_api_key
-- ============================================================================

CREATE TABLE clinic_api_key (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinic(id) ON DELETE CASCADE,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE clinic_api_key IS 'API keys for clinic authentication. key_hash is SHA-256; raw key never stored.';

CREATE INDEX idx_clinic_api_key_prefix ON clinic_api_key(key_prefix) WHERE active = true;

-- ============================================================================
-- TABLE: patient_ref (minimal identity pointer — NOT an EMR)
-- ============================================================================

CREATE TABLE patient_ref (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinic(id),
  clinic_patient_key TEXT NOT NULL,
  display_name TEXT,
  birth_year INT,
  dedupe_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(clinic_id, clinic_patient_key)
);

COMMENT ON TABLE patient_ref IS 'Minimal identity pointer for surgery requests. Not an EMR patient record.';

CREATE TRIGGER patient_ref_updated_at BEFORE UPDATE ON patient_ref
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- TABLE: surgery_request
-- ============================================================================

CREATE TABLE surgery_request (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_facility_id UUID NOT NULL REFERENCES facility(id),
  source_clinic_id UUID NOT NULL REFERENCES clinic(id),
  source_request_id TEXT NOT NULL,
  status surgery_request_status NOT NULL DEFAULT 'SUBMITTED',
  procedure_name TEXT NOT NULL,
  surgeon_id UUID REFERENCES app_user(id),
  scheduled_date DATE,
  scheduled_time TIME,
  patient_ref_id UUID NOT NULL REFERENCES patient_ref(id),
  submitted_at TIMESTAMPTZ NOT NULL,
  last_submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_clinic_id, source_request_id)
);

COMMENT ON TABLE surgery_request IS 'Pre-case readiness artifact submitted by clinics. Becomes surgical_case only after ASC conversion.';

CREATE INDEX idx_surgery_request_facility_status ON surgery_request(target_facility_id, status);
CREATE INDEX idx_surgery_request_clinic ON surgery_request(source_clinic_id);
CREATE INDEX idx_surgery_request_surgeon ON surgery_request(surgeon_id) WHERE surgeon_id IS NOT NULL;
CREATE INDEX idx_surgery_request_scheduled ON surgery_request(target_facility_id, scheduled_date) WHERE scheduled_date IS NOT NULL;

CREATE TRIGGER surgery_request_updated_at BEFORE UPDATE ON surgery_request
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- TABLE: surgery_request_submission (append-only)
-- ============================================================================

CREATE TABLE surgery_request_submission (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES surgery_request(id) ON DELETE CASCADE,
  submission_seq INT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(request_id, submission_seq)
);

COMMENT ON TABLE surgery_request_submission IS 'Append-only log of each clinic submission attempt for a surgery request.';

CREATE TRIGGER surgery_request_submission_no_update
  BEFORE UPDATE ON surgery_request_submission
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER surgery_request_submission_no_delete
  BEFORE DELETE ON surgery_request_submission
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- ============================================================================
-- TABLE: surgery_request_checklist_template_version
-- ============================================================================

CREATE TABLE surgery_request_checklist_template_version (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_facility_id UUID NOT NULL REFERENCES facility(id),
  name TEXT NOT NULL,
  version INT NOT NULL,
  schema JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(target_facility_id, name, version)
);

COMMENT ON TABLE surgery_request_checklist_template_version IS 'Versioned checklist templates that clinics must fill when submitting surgery requests.';

CREATE INDEX idx_checklist_template_facility_active ON surgery_request_checklist_template_version(target_facility_id, active)
  WHERE active = true;

-- ============================================================================
-- TABLE: surgery_request_checklist_instance
-- ============================================================================

CREATE TABLE surgery_request_checklist_instance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES surgery_request(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES surgery_request_submission(id) ON DELETE CASCADE,
  template_version_id UUID NOT NULL REFERENCES surgery_request_checklist_template_version(id),
  status surgery_request_checklist_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE surgery_request_checklist_instance IS 'Checklist instance tied to a specific submission of a surgery request.';

CREATE INDEX idx_checklist_instance_request ON surgery_request_checklist_instance(request_id);
CREATE INDEX idx_checklist_instance_submission ON surgery_request_checklist_instance(submission_id);

CREATE TRIGGER surgery_request_checklist_instance_updated_at BEFORE UPDATE ON surgery_request_checklist_instance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- TABLE: surgery_request_checklist_response (append-only)
-- ============================================================================

CREATE TABLE surgery_request_checklist_response (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instance_id UUID NOT NULL REFERENCES surgery_request_checklist_instance(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  response JSONB NOT NULL,
  actor_type surgery_request_actor_type NOT NULL,
  actor_clinic_id UUID REFERENCES clinic(id),
  actor_user_id UUID REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE surgery_request_checklist_response IS 'Append-only checklist item responses. No UPDATEs allowed.';

CREATE INDEX idx_checklist_response_instance ON surgery_request_checklist_response(instance_id);

CREATE TRIGGER surgery_request_checklist_response_no_update
  BEFORE UPDATE ON surgery_request_checklist_response
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER surgery_request_checklist_response_no_delete
  BEFORE DELETE ON surgery_request_checklist_response
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- ============================================================================
-- TABLE: surgery_request_audit_event (append-only)
-- ============================================================================

CREATE TABLE surgery_request_audit_event (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES surgery_request(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES surgery_request_submission(id),
  event_type surgery_request_event_type NOT NULL,
  actor_type surgery_request_actor_type NOT NULL,
  actor_clinic_id UUID REFERENCES clinic(id),
  actor_user_id UUID REFERENCES app_user(id),
  reason_code TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE surgery_request_audit_event IS 'Append-only audit trail of all surgery request lifecycle events.';

CREATE INDEX idx_surgery_request_audit_request ON surgery_request_audit_event(request_id);
CREATE INDEX idx_surgery_request_audit_event_type ON surgery_request_audit_event(event_type);

CREATE TRIGGER surgery_request_audit_event_no_update
  BEFORE UPDATE ON surgery_request_audit_event
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER surgery_request_audit_event_no_delete
  BEFORE DELETE ON surgery_request_audit_event
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- ============================================================================
-- TABLE: surgery_request_conversion (bridge to surgical_case)
-- ============================================================================

CREATE TABLE surgery_request_conversion (
  request_id UUID PRIMARY KEY REFERENCES surgery_request(id) ON DELETE CASCADE,
  surgical_case_id UUID UNIQUE NOT NULL REFERENCES surgical_case(id),
  converted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  converted_by_user_id UUID NOT NULL REFERENCES app_user(id)
);

COMMENT ON TABLE surgery_request_conversion IS 'Links a converted surgery request to its resulting surgical_case. One-to-one.';
