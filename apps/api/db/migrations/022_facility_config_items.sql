-- Migration 022: Facility Configuration Items
-- Dynamic lists for facility-specific configurations (Patient Flags, Anesthesia Modalities, etc.)

-- ============================================================================
-- CONFIG ITEM TYPE ENUM
-- ============================================================================

CREATE TYPE config_item_type AS ENUM (
  'PATIENT_FLAG',
  'ANESTHESIA_MODALITY'
);

-- ============================================================================
-- FACILITY CONFIG ITEMS TABLE
-- ============================================================================

CREATE TABLE facility_config_item (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),

  -- Item definition
  item_type config_item_type NOT NULL,
  item_key VARCHAR(100) NOT NULL,
  display_label VARCHAR(255) NOT NULL,
  description TEXT,

  -- Ordering and status
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(facility_id, item_type, item_key)
);

CREATE INDEX idx_facility_config_item_facility ON facility_config_item(facility_id);
CREATE INDEX idx_facility_config_item_type ON facility_config_item(facility_id, item_type);
CREATE INDEX idx_facility_config_item_active ON facility_config_item(facility_id, item_type, active);
CREATE INDEX idx_facility_config_item_sort ON facility_config_item(facility_id, item_type, sort_order);

-- Updated_at trigger
CREATE TRIGGER facility_config_item_updated_at
  BEFORE UPDATE ON facility_config_item
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- MIGRATE MODALITIES COLUMN TO TEXT[] FOR FLEXIBILITY
-- ============================================================================

-- Change modalities from anesthesia_modality[] to TEXT[] to allow custom values
ALTER TABLE case_anesthesia_plan
  ALTER COLUMN modalities TYPE TEXT[]
  USING modalities::TEXT[];

COMMENT ON COLUMN case_anesthesia_plan.modalities IS 'Array of anesthesia modality keys (TEXT for flexibility with custom values)';

-- ============================================================================
-- SEED DEFAULT ITEMS FOR EXISTING FACILITIES
-- ============================================================================

-- Insert default Patient Flags (matching existing hardcoded values)
INSERT INTO facility_config_item (facility_id, item_type, item_key, display_label, sort_order)
SELECT
  f.id,
  'PATIENT_FLAG',
  flags.item_key,
  flags.display_label,
  flags.sort_order
FROM facility f
CROSS JOIN (VALUES
  ('latexAllergy', 'Latex-Free Required', 1),
  ('iodineAllergy', 'Iodine-Free Required', 2),
  ('nickelFree', 'Nickel-Free Implants', 3),
  ('anticoagulation', 'Anticoagulation Consideration', 4),
  ('infectionRisk', 'Infection Risk', 5),
  ('neuromonitoringRequired', 'Neuromonitoring Required', 6)
) AS flags(item_key, display_label, sort_order)
ON CONFLICT (facility_id, item_type, item_key) DO NOTHING;

-- Insert default Anesthesia Modalities (matching existing enum values)
INSERT INTO facility_config_item (facility_id, item_type, item_key, display_label, sort_order)
SELECT
  f.id,
  'ANESTHESIA_MODALITY',
  modalities.item_key,
  modalities.display_label,
  modalities.sort_order
FROM facility f
CROSS JOIN (VALUES
  ('GENERAL', 'General', 1),
  ('SPINAL', 'Spinal', 2),
  ('REGIONAL', 'Regional', 3),
  ('MAC', 'MAC', 4),
  ('LOCAL', 'Local', 5),
  ('TIVA', 'TIVA', 6)
) AS modalities(item_key, display_label, sort_order)
ON CONFLICT (facility_id, item_type, item_key) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE facility_config_item IS 'Facility-specific configuration items for dynamic lists (patient flags, anesthesia modalities, etc.)';
COMMENT ON COLUMN facility_config_item.item_type IS 'Type of configuration item: PATIENT_FLAG, ANESTHESIA_MODALITY, etc.';
COMMENT ON COLUMN facility_config_item.item_key IS 'Machine-readable key used in JSONB storage and code references';
COMMENT ON COLUMN facility_config_item.display_label IS 'Human-readable label shown in UI';
COMMENT ON COLUMN facility_config_item.sort_order IS 'Display order in UI (lower numbers appear first)';
