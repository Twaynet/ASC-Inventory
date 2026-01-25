-- Migration: Facility Catalog Groups
-- LAW Reference: docs/LAW/catalog.md Section 4D (Facility Groups)
-- Change Type: Additive (new tables only)
--
-- Implements admin-editable groups for human organization of catalog items.
-- LAW Constraints:
--   - Groups are facility-defined and admin-editable
--   - Items may belong to multiple groups
--   - Groups MUST NOT drive alarms, readiness, or enforcement logic
--   - Groups exist for UI, reporting, and purchasing only

-- ============================================================================
-- CATALOG GROUP TABLE
-- ============================================================================

CREATE TABLE catalog_group (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Enforce unique group names per facility (case-insensitive)
  CONSTRAINT uq_catalog_group_facility_name UNIQUE (facility_id, name)
);

CREATE INDEX idx_catalog_group_facility ON catalog_group(facility_id);
CREATE INDEX idx_catalog_group_active ON catalog_group(facility_id, active);

COMMENT ON TABLE catalog_group IS 'LAW 4D: Facility-defined groups for human organization. MUST NOT drive alarms, readiness, or enforcement.';
COMMENT ON COLUMN catalog_group.name IS 'Unique name within facility (case-sensitive at storage, application enforces case-insensitive uniqueness)';

-- ============================================================================
-- CATALOG GROUP ITEM (MANY-TO-MANY JOIN TABLE)
-- ============================================================================

CREATE TABLE catalog_group_item (
  facility_id UUID NOT NULL REFERENCES facility(id),
  group_id UUID NOT NULL REFERENCES catalog_group(id) ON DELETE CASCADE,
  catalog_id UUID NOT NULL REFERENCES item_catalog(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Composite primary key prevents duplicate membership
  PRIMARY KEY (group_id, catalog_id)
);

CREATE INDEX idx_catalog_group_item_facility ON catalog_group_item(facility_id);
CREATE INDEX idx_catalog_group_item_catalog ON catalog_group_item(catalog_id);
CREATE INDEX idx_catalog_group_item_group ON catalog_group_item(group_id);

COMMENT ON TABLE catalog_group_item IS 'Maps catalog items to groups (many-to-many). Facility_id column enforces tenant boundary in application layer.';

-- ============================================================================
-- UPDATED_AT TRIGGER FOR CATALOG_GROUP
-- ============================================================================

CREATE TRIGGER catalog_group_updated_at BEFORE UPDATE ON catalog_group
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
