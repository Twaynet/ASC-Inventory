-- Migration: Debrief Conditional Signatures
-- Updates debrief workflow for conditional SCRUB/SURGEON signatures

-- ============================================================================
-- ADD PENDING REVIEW TRACKING
-- ============================================================================

-- Add review status to track async SCRUB/SURGEON sign-offs
ALTER TABLE case_checklist_instance
ADD COLUMN IF NOT EXISTS pending_scrub_review BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS pending_surgeon_review BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS scrub_review_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS surgeon_review_completed_at TIMESTAMPTZ;

-- Index for finding pending reviews
CREATE INDEX IF NOT EXISTS idx_case_checklist_pending_reviews
ON case_checklist_instance(facility_id, type, pending_scrub_review, pending_surgeon_review)
WHERE type = 'DEBRIEF';

-- ============================================================================
-- UPDATE DEBRIEF TEMPLATE
-- ============================================================================

-- Create new debrief template version with:
-- 1. Role-specific notes fields (scrub_notes, surgeon_notes)
-- 2. Conditional signature metadata
-- 3. Active selection (no defaults) for circulator inputs

DO $$
DECLARE
  v_facility_id UUID;
  v_admin_user_id UUID;
  v_debrief_template_id UUID;
  v_new_version_id UUID;
  v_current_version INT;
BEGIN
  -- Get the first facility
  SELECT id INTO v_facility_id FROM facility LIMIT 1;

  IF v_facility_id IS NULL THEN
    RETURN;
  END IF;

  -- Get an admin user for created_by
  SELECT id INTO v_admin_user_id FROM app_user WHERE facility_id = v_facility_id AND role = 'ADMIN' LIMIT 1;

  IF v_admin_user_id IS NULL THEN
    SELECT id INTO v_admin_user_id FROM app_user WHERE facility_id = v_facility_id LIMIT 1;
  END IF;

  IF v_admin_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Get debrief template
  SELECT id INTO v_debrief_template_id FROM checklist_template WHERE facility_id = v_facility_id AND type = 'DEBRIEF';

  IF v_debrief_template_id IS NULL THEN
    RETURN;
  END IF;

  -- Get current version number
  SELECT COALESCE(MAX(version_number), 0) INTO v_current_version
  FROM checklist_template_version
  WHERE template_id = v_debrief_template_id;

  -- Create new version with updated items and conditional signatures
  INSERT INTO checklist_template_version (id, template_id, version_number, items, required_signatures, created_by_user_id)
  VALUES (
    uuid_generate_v4(),
    v_debrief_template_id,
    v_current_version + 1,
    '[
      {"key": "counts_status", "label": "Counts status", "type": "select", "required": true, "options": ["correct", "exception"], "noDefault": true},
      {"key": "specimens", "label": "Specimens", "type": "select", "required": true, "options": ["yes", "no"], "noDefault": true},
      {"key": "specimens_details", "label": "Specimen details", "type": "text", "required": false, "showIf": {"key": "specimens", "value": "yes"}},
      {"key": "implants_confirmed", "label": "Implants used confirmed", "type": "checkbox", "required": true},
      {"key": "equipment_issues", "label": "Equipment issues", "type": "select", "required": true, "options": ["yes", "no"], "noDefault": true},
      {"key": "equipment_notes", "label": "Equipment issue notes", "type": "text", "required": false, "showIf": {"key": "equipment_issues", "value": "yes"}},
      {"key": "improvement_notes", "label": "Improvement opportunity", "type": "text", "required": false},
      {"key": "scrub_notes", "label": "Scrub Tech Notes/Corrections", "type": "text", "required": false, "roleRestricted": "SCRUB"},
      {"key": "surgeon_notes", "label": "Surgeon Notes/Corrections", "type": "text", "required": false, "roleRestricted": "SURGEON"}
    ]'::jsonb,
    '[
      {"role": "CIRCULATOR", "required": true, "conditional": false},
      {"role": "SCRUB", "required": false, "conditional": true, "conditions": ["counts_status=exception", "equipment_issues=yes"]},
      {"role": "SURGEON", "required": false, "conditional": true, "conditions": ["counts_status=exception", "equipment_issues=yes", "specimens=yes", "improvement_notes!=empty"]}
    ]'::jsonb,
    v_admin_user_id
  )
  RETURNING id INTO v_new_version_id;

  -- Update template to use new version
  UPDATE checklist_template SET current_version_id = v_new_version_id WHERE id = v_debrief_template_id;

END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN case_checklist_instance.pending_scrub_review IS 'True if SCRUB review is required but not yet completed';
COMMENT ON COLUMN case_checklist_instance.pending_surgeon_review IS 'True if SURGEON review is required but not yet completed';
COMMENT ON COLUMN case_checklist_instance.scrub_review_completed_at IS 'When SCRUB completed their async review';
COMMENT ON COLUMN case_checklist_instance.surgeon_review_completed_at IS 'When SURGEON completed their async review';
