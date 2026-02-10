-- Migration: 051_organization_model
-- Purpose: Organization model for PHI access scoping and case attribution
-- LAW Reference: PHI_ACCESS_AND_RETENTION_LAW — Organizational Isolation by Default

-- ============================================================================
-- ORGANIZATION TYPE ENUM
-- ============================================================================

CREATE TYPE organization_type AS ENUM (
  'ASC',              -- The facility itself as an organization
  'SURGEON_GROUP',    -- Multi-surgeon practice
  'OFFICE',           -- Surgeon's office staff
  'BILLING_ENTITY'    -- External billing entity (under BAA)
);

-- ============================================================================
-- ORGANIZATION TABLE
-- ============================================================================

CREATE TABLE organization (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  name VARCHAR(255) NOT NULL,
  organization_type organization_type NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Organization name must be unique within a facility
  UNIQUE(facility_id, name)
);

-- Indexes for common query patterns
CREATE INDEX idx_organization_facility ON organization(facility_id);
CREATE INDEX idx_organization_type ON organization(organization_type);

-- Constraint 1: Exactly one active ASC organization per facility
-- This ensures uniform PHI enforcement via a single ASC org per facility
CREATE UNIQUE INDEX idx_one_asc_per_facility
  ON organization(facility_id)
  WHERE organization_type = 'ASC' AND is_active = true;

-- ============================================================================
-- BACKFILL: Create ASC organization for each existing facility
-- ============================================================================

INSERT INTO organization (facility_id, name, organization_type)
SELECT id, name, 'ASC'
FROM facility
WHERE NOT EXISTS (
  SELECT 1 FROM organization
  WHERE facility_id = facility.id AND organization_type = 'ASC'
);

COMMENT ON TABLE organization IS 'PHI LAW: Organizations within a facility for PHI access scoping';
COMMENT ON COLUMN organization.facility_id IS 'Parent facility — organizations exist only within a single facility';
COMMENT ON COLUMN organization.organization_type IS 'ASC, SURGEON_GROUP, OFFICE, or BILLING_ENTITY';
COMMENT ON INDEX idx_one_asc_per_facility IS 'Constraint 1: Exactly one active ASC organization per facility';
