-- Migration: Catalog Set Components (Kit/Tray Definitions)
-- LAW Reference: docs/LAW/catalog.md v2.1 Amendment - Set Definitions
-- Change Type: Additive (new table only)
--
-- Implements Catalog-level Set Component definitions for loaner sets,
-- instrument trays, and composite items.
--
-- LAW Constraints (NON-NEGOTIABLE):
--   - Set Definitions declare EXPECTATION ONLY, not physical state
--   - DO NOT prove component exists, is present, or is sterile
--   - DO NOT prove readiness or replace verification workflows
--   - DO NOT create inventory records
--   - Catalog Sets are inputs to verification workflows, never outputs

-- ============================================================================
-- CATALOG SET COMPONENT TABLE
-- ============================================================================

CREATE TABLE catalog_set_component (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  set_catalog_id UUID NOT NULL REFERENCES item_catalog(id),
  component_catalog_id UUID NOT NULL REFERENCES item_catalog(id),
  required_quantity INT NOT NULL DEFAULT 0 CHECK (required_quantity >= 0),
  optional_quantity INT NOT NULL DEFAULT 0 CHECK (optional_quantity >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent same component being added to same set twice
  CONSTRAINT uq_set_component UNIQUE (set_catalog_id, component_catalog_id),

  -- Prevent a set from containing itself
  CONSTRAINT chk_no_self_reference CHECK (set_catalog_id != component_catalog_id)
);

CREATE INDEX idx_set_component_facility ON catalog_set_component(facility_id);
CREATE INDEX idx_set_component_set ON catalog_set_component(set_catalog_id);
CREATE INDEX idx_set_component_component ON catalog_set_component(component_catalog_id);

COMMENT ON TABLE catalog_set_component IS 'LAW v2.1: Catalog Set Component definitions. Declares EXPECTED composition of sets/kits/trays. DOES NOT assert physical state, readiness, or verification truth.';
COMMENT ON COLUMN catalog_set_component.set_catalog_id IS 'The parent set (Catalog Item representing the kit/tray)';
COMMENT ON COLUMN catalog_set_component.component_catalog_id IS 'Expected component item type';
COMMENT ON COLUMN catalog_set_component.required_quantity IS 'Number of this component expected to be present (0 = informational only)';
COMMENT ON COLUMN catalog_set_component.optional_quantity IS 'Additional optional quantity beyond required';
COMMENT ON COLUMN catalog_set_component.notes IS 'Descriptive notes for staff reference only';
