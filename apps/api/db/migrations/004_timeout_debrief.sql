-- Migration: OR Time Out & Post-op Debrief Gates
-- Feature-flagged checklist system for surgical workflow gates

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE checklist_type AS ENUM ('TIMEOUT', 'DEBRIEF');
CREATE TYPE checklist_status AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');
CREATE TYPE signature_method AS ENUM ('LOGIN', 'PIN', 'BADGE', 'KIOSK_TAP');

-- ============================================================================
-- TABLES
-- ============================================================================

-- Facility Settings (feature flags)
CREATE TABLE facility_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL UNIQUE REFERENCES facility(id),
  enable_timeout_debrief BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_facility_settings_facility ON facility_settings(facility_id);

-- Room (optional, for OR room tracking)
CREATE TABLE room (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  name VARCHAR(100) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, name)
);

CREATE INDEX idx_room_facility ON room(facility_id);

-- Checklist Template
CREATE TABLE checklist_template (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  type checklist_type NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  current_version_id UUID, -- FK added after version table created
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, type)
);

CREATE INDEX idx_checklist_template_facility ON checklist_template(facility_id);
CREATE INDEX idx_checklist_template_type ON checklist_template(facility_id, type);

-- Checklist Template Version (immutable)
CREATE TABLE checklist_template_version (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES checklist_template(id),
  version_number INT NOT NULL,
  items JSONB NOT NULL, -- Array of {key, label, type, required, options?}
  required_signatures JSONB NOT NULL, -- Array of {role, required}
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, version_number)
);

CREATE INDEX idx_checklist_template_version_template ON checklist_template_version(template_id);

-- Add FK from template to current version
ALTER TABLE checklist_template
  ADD CONSTRAINT fk_checklist_template_current_version
  FOREIGN KEY (current_version_id) REFERENCES checklist_template_version(id);

-- Case Checklist Instance (per-case checklist)
CREATE TABLE case_checklist_instance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES surgical_case(id),
  facility_id UUID NOT NULL REFERENCES facility(id),
  type checklist_type NOT NULL,
  template_version_id UUID NOT NULL REFERENCES checklist_template_version(id),
  status checklist_status NOT NULL DEFAULT 'NOT_STARTED',
  room_id UUID REFERENCES room(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by_user_id UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(case_id, type)
);

CREATE INDEX idx_case_checklist_instance_case ON case_checklist_instance(case_id);
CREATE INDEX idx_case_checklist_instance_facility ON case_checklist_instance(facility_id);
CREATE INDEX idx_case_checklist_instance_type ON case_checklist_instance(case_id, type);
CREATE INDEX idx_case_checklist_instance_status ON case_checklist_instance(case_id, status);

-- Case Checklist Response (append-only)
CREATE TABLE case_checklist_response (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instance_id UUID NOT NULL REFERENCES case_checklist_instance(id),
  item_key VARCHAR(100) NOT NULL,
  value TEXT NOT NULL,
  completed_by_user_id UUID NOT NULL REFERENCES app_user(id),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_case_checklist_response_instance ON case_checklist_response(instance_id);
CREATE INDEX idx_case_checklist_response_item ON case_checklist_response(instance_id, item_key);

-- Protect responses from modification (append-only)
CREATE TRIGGER case_checklist_response_no_update
  BEFORE UPDATE ON case_checklist_response
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER case_checklist_response_no_delete
  BEFORE DELETE ON case_checklist_response
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- Case Checklist Signature (append-only)
CREATE TABLE case_checklist_signature (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instance_id UUID NOT NULL REFERENCES case_checklist_instance(id),
  role VARCHAR(50) NOT NULL,
  signed_by_user_id UUID NOT NULL REFERENCES app_user(id),
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  method signature_method NOT NULL DEFAULT 'LOGIN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(instance_id, role)
);

CREATE INDEX idx_case_checklist_signature_instance ON case_checklist_signature(instance_id);

-- Protect signatures from modification (append-only)
CREATE TRIGGER case_checklist_signature_no_update
  BEFORE UPDATE ON case_checklist_signature
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER case_checklist_signature_no_delete
  BEFORE DELETE ON case_checklist_signature
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE TRIGGER facility_settings_updated_at
  BEFORE UPDATE ON facility_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER room_updated_at
  BEFORE UPDATE ON room
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER checklist_template_updated_at
  BEFORE UPDATE ON checklist_template
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER case_checklist_instance_updated_at
  BEFORE UPDATE ON case_checklist_instance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- SEED DATA: Default templates for existing facility
-- ============================================================================

-- Insert facility settings for existing facility (feature disabled by default)
INSERT INTO facility_settings (facility_id, enable_timeout_debrief)
SELECT id, false FROM facility
ON CONFLICT (facility_id) DO NOTHING;

-- Create default Time Out template
INSERT INTO checklist_template (id, facility_id, type, name, is_active)
SELECT
  uuid_generate_v4(),
  f.id,
  'TIMEOUT',
  'OR Time Out',
  true
FROM facility f
ON CONFLICT (facility_id, type) DO NOTHING;

-- Create default Debrief template
INSERT INTO checklist_template (id, facility_id, type, name, is_active)
SELECT
  uuid_generate_v4(),
  f.id,
  'DEBRIEF',
  'Post-Op Debrief',
  true
FROM facility f
ON CONFLICT (facility_id, type) DO NOTHING;

-- Create Time Out template version with default items
-- (Need to use a function or DO block to get the admin user and template IDs)
DO $$
DECLARE
  v_facility_id UUID;
  v_admin_user_id UUID;
  v_timeout_template_id UUID;
  v_debrief_template_id UUID;
  v_timeout_version_id UUID;
  v_debrief_version_id UUID;
BEGIN
  -- Get the first facility
  SELECT id INTO v_facility_id FROM facility LIMIT 1;

  IF v_facility_id IS NULL THEN
    RETURN;
  END IF;

  -- Get an admin user for created_by
  SELECT id INTO v_admin_user_id FROM app_user WHERE facility_id = v_facility_id AND role = 'ADMIN' LIMIT 1;

  IF v_admin_user_id IS NULL THEN
    -- Fall back to any user
    SELECT id INTO v_admin_user_id FROM app_user WHERE facility_id = v_facility_id LIMIT 1;
  END IF;

  IF v_admin_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Get template IDs
  SELECT id INTO v_timeout_template_id FROM checklist_template WHERE facility_id = v_facility_id AND type = 'TIMEOUT';
  SELECT id INTO v_debrief_template_id FROM checklist_template WHERE facility_id = v_facility_id AND type = 'DEBRIEF';

  -- Create Time Out version
  IF v_timeout_template_id IS NOT NULL THEN
    INSERT INTO checklist_template_version (id, template_id, version_number, items, required_signatures, created_by_user_id)
    VALUES (
      uuid_generate_v4(),
      v_timeout_template_id,
      1,
      '[
        {"key": "patient_identity", "label": "Patient identity confirmed", "type": "checkbox", "required": true},
        {"key": "procedure_confirmed", "label": "Procedure confirmed", "type": "checkbox", "required": true},
        {"key": "site_laterality", "label": "Site/laterality confirmed", "type": "checkbox", "required": true},
        {"key": "consent_verified", "label": "Consent verified", "type": "checkbox", "required": true},
        {"key": "antibiotics_status", "label": "Antibiotics status", "type": "select", "required": true, "options": ["given", "not_applicable", "pending"]},
        {"key": "inventory_readiness", "label": "Implant/equipment readiness", "type": "readonly", "required": false}
      ]'::jsonb,
      '[
        {"role": "CIRCULATOR", "required": true},
        {"role": "SURGEON", "required": true},
        {"role": "ANESTHESIA", "required": false},
        {"role": "SCRUB", "required": false}
      ]'::jsonb,
      v_admin_user_id
    )
    RETURNING id INTO v_timeout_version_id;

    -- Set current version
    UPDATE checklist_template SET current_version_id = v_timeout_version_id WHERE id = v_timeout_template_id;
  END IF;

  -- Create Debrief version
  IF v_debrief_template_id IS NOT NULL THEN
    INSERT INTO checklist_template_version (id, template_id, version_number, items, required_signatures, created_by_user_id)
    VALUES (
      uuid_generate_v4(),
      v_debrief_template_id,
      1,
      '[
        {"key": "counts_status", "label": "Counts status", "type": "select", "required": true, "options": ["correct", "exception"]},
        {"key": "specimens", "label": "Specimens", "type": "select", "required": true, "options": ["yes", "no"]},
        {"key": "specimens_details", "label": "Specimen details", "type": "text", "required": false},
        {"key": "implants_confirmed", "label": "Implants used confirmed", "type": "checkbox", "required": true},
        {"key": "equipment_issues", "label": "Equipment issues", "type": "select", "required": true, "options": ["yes", "no"]},
        {"key": "equipment_notes", "label": "Equipment issue notes", "type": "text", "required": false},
        {"key": "improvement_notes", "label": "Improvement opportunity", "type": "text", "required": false}
      ]'::jsonb,
      '[
        {"role": "CIRCULATOR", "required": true},
        {"role": "SURGEON", "required": false},
        {"role": "SCRUB", "required": false}
      ]'::jsonb,
      v_admin_user_id
    )
    RETURNING id INTO v_debrief_version_id;

    -- Set current version
    UPDATE checklist_template SET current_version_id = v_debrief_version_id WHERE id = v_debrief_template_id;
  END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE facility_settings IS 'Per-facility feature flags and settings';
COMMENT ON COLUMN facility_settings.enable_timeout_debrief IS 'When true, OR Time Out and Post-op Debrief gates are enforced';

COMMENT ON TABLE checklist_template IS 'Reusable checklist definitions (one per type per facility)';
COMMENT ON TABLE checklist_template_version IS 'Immutable snapshots of checklist templates';
COMMENT ON TABLE case_checklist_instance IS 'Per-case checklist assignment and status';
COMMENT ON TABLE case_checklist_response IS 'Append-only checklist item responses';
COMMENT ON TABLE case_checklist_signature IS 'Append-only role-based signatures';
COMMENT ON TABLE room IS 'OR rooms for location tracking';
