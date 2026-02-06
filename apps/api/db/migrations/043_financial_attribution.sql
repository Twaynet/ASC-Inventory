-- Migration: 043_financial_attribution
-- Purpose: Add financial tracking, vendor management, and loaner set support
-- Phase: Wave 1 of Financial Attribution implementation
--
-- This migration adds:
-- - vendor table (lightweight vendor entity)
-- - loaner_set table (track loaner trays as logical units)
-- - catalog_cost_event table (append-only cost change audit)
-- - Financial attribution fields on inventory_event
-- - Ownership and loaner fields on inventory_item and item_catalog
--
-- NOTE: All new columns are nullable to preserve existing data.
-- No historical financial data is fabricated.

-- ============================================================================
-- NEW ENUMS
-- ============================================================================

CREATE TYPE vendor_type AS ENUM (
  'MANUFACTURER',
  'DISTRIBUTOR',
  'LOANER_PROVIDER',
  'CONSIGNMENT'
);

CREATE TYPE ownership_type AS ENUM (
  'OWNED',
  'CONSIGNED',
  'LOANER',
  'GRATIS'
);

CREATE TYPE source_event_type AS ENUM (
  'PURCHASED',
  'CONSIGNMENT_RECEIVED',
  'LOANER_RECEIVED',
  'SAMPLE',
  'TRANSFER'
);

CREATE TYPE cost_override_reason AS ENUM (
  'CATALOG_ERROR',
  'NEGOTIATED_DISCOUNT',
  'VENDOR_CONCESSION',
  'DAMAGE_CREDIT',
  'EXPIRED_CREDIT',
  'CONTRACT_ADJUSTMENT',
  'GRATIS_CONVERSION',
  'OTHER'
);

CREATE TYPE gratis_reason AS ENUM (
  'VENDOR_SAMPLE',
  'VENDOR_SUPPORT',
  'CLINICAL_TRIAL',
  'GOODWILL',
  'WARRANTY_REPLACEMENT',
  'OTHER'
);

-- ============================================================================
-- NEW TABLE: vendor
-- Lightweight vendor entity for attribution (not ERP integration)
-- ============================================================================

CREATE TABLE vendor (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  name TEXT NOT NULL,
  vendor_type vendor_type NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, name)
);

CREATE INDEX idx_vendor_facility ON vendor(facility_id);
CREATE INDEX idx_vendor_type ON vendor(facility_id, vendor_type);
CREATE INDEX idx_vendor_active ON vendor(facility_id, is_active);

-- ============================================================================
-- NEW TABLE: loaner_set
-- Track loaner trays as logical units for return tracking
-- ============================================================================

CREATE TABLE loaner_set (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  vendor_id UUID NOT NULL REFERENCES vendor(id),
  set_identifier TEXT NOT NULL,
  description TEXT,
  case_id UUID REFERENCES surgical_case(id),
  received_at TIMESTAMPTZ NOT NULL,
  received_by_user_id UUID NOT NULL REFERENCES app_user(id),
  expected_return_date DATE,
  returned_at TIMESTAMPTZ,
  returned_by_user_id UUID REFERENCES app_user(id),
  item_count INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, vendor_id, set_identifier, received_at)
);

CREATE INDEX idx_loaner_set_facility ON loaner_set(facility_id);
CREATE INDEX idx_loaner_set_vendor ON loaner_set(vendor_id);
CREATE INDEX idx_loaner_set_case ON loaner_set(case_id) WHERE case_id IS NOT NULL;
CREATE INDEX idx_loaner_set_open ON loaner_set(facility_id, returned_at) WHERE returned_at IS NULL;
CREATE INDEX idx_loaner_set_overdue ON loaner_set(facility_id, expected_return_date)
  WHERE returned_at IS NULL AND expected_return_date IS NOT NULL;

-- ============================================================================
-- NEW TABLE: catalog_cost_event (APPEND-ONLY)
-- Audit trail for catalog cost changes
-- ============================================================================

CREATE TABLE catalog_cost_event (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  catalog_id UUID NOT NULL REFERENCES item_catalog(id),
  previous_cost_cents INTEGER,
  new_cost_cents INTEGER NOT NULL CHECK (new_cost_cents >= 0),
  effective_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  changed_by_user_id UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_catalog_cost_event_catalog ON catalog_cost_event(catalog_id);
CREATE INDEX idx_catalog_cost_event_effective ON catalog_cost_event(catalog_id, effective_at DESC);

-- Append-only protection for catalog_cost_event
CREATE TRIGGER catalog_cost_event_no_update
  BEFORE UPDATE ON catalog_cost_event
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER catalog_cost_event_no_delete
  BEFORE DELETE ON catalog_cost_event
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- ============================================================================
-- ALTER TABLE: item_catalog
-- Add cost and ownership fields
-- ============================================================================

ALTER TABLE item_catalog
  ADD COLUMN unit_cost_cents INTEGER CHECK (unit_cost_cents IS NULL OR unit_cost_cents >= 0),
  ADD COLUMN unit_cost_effective_at TIMESTAMPTZ,
  ADD COLUMN ownership_type ownership_type DEFAULT 'OWNED',
  ADD COLUMN consignment_vendor_id UUID REFERENCES vendor(id),
  ADD COLUMN is_billable BOOLEAN DEFAULT true,
  ADD COLUMN cost_notes TEXT;

-- Constraint: consigned items must have a vendor
ALTER TABLE item_catalog
  ADD CONSTRAINT chk_catalog_consignment_vendor
  CHECK (ownership_type != 'CONSIGNED' OR consignment_vendor_id IS NOT NULL);

CREATE INDEX idx_catalog_ownership ON item_catalog(facility_id, ownership_type);
CREATE INDEX idx_catalog_consignment_vendor ON item_catalog(consignment_vendor_id)
  WHERE consignment_vendor_id IS NOT NULL;

-- ============================================================================
-- ALTER TABLE: inventory_item
-- Add ownership, source, and loaner tracking fields
-- ============================================================================

ALTER TABLE inventory_item
  ADD COLUMN ownership_type ownership_type,
  ADD COLUMN source_vendor_id UUID REFERENCES vendor(id),
  ADD COLUMN source_event_type source_event_type,
  ADD COLUMN loaner_set_id UUID REFERENCES loaner_set(id),
  ADD COLUMN loaner_due_date DATE,
  ADD COLUMN loaner_returned_at TIMESTAMPTZ,
  ADD COLUMN loaner_return_event_id UUID REFERENCES inventory_event(id);

CREATE INDEX idx_inventory_ownership ON inventory_item(facility_id, ownership_type)
  WHERE ownership_type IS NOT NULL;
CREATE INDEX idx_inventory_source_vendor ON inventory_item(source_vendor_id)
  WHERE source_vendor_id IS NOT NULL;
CREATE INDEX idx_inventory_loaner_set ON inventory_item(loaner_set_id)
  WHERE loaner_set_id IS NOT NULL;
CREATE INDEX idx_inventory_loaner_open ON inventory_item(facility_id, loaner_due_date)
  WHERE ownership_type = 'LOANER' AND loaner_returned_at IS NULL;

-- ============================================================================
-- ALTER TABLE: inventory_event
-- Add financial attribution fields
-- ============================================================================

ALTER TABLE inventory_event
  ADD COLUMN cost_snapshot_cents INTEGER CHECK (cost_snapshot_cents IS NULL OR cost_snapshot_cents >= 0),
  ADD COLUMN cost_override_cents INTEGER CHECK (cost_override_cents IS NULL OR cost_override_cents >= 0),
  ADD COLUMN cost_override_reason cost_override_reason,
  ADD COLUMN cost_override_note TEXT,
  ADD COLUMN provided_by_vendor_id UUID REFERENCES vendor(id),
  ADD COLUMN provided_by_rep_name TEXT,
  ADD COLUMN is_gratis BOOLEAN DEFAULT false,
  ADD COLUMN gratis_reason gratis_reason,
  ADD COLUMN financial_attestation_user_id UUID REFERENCES app_user(id);

-- Constraint: cost override requires a reason
ALTER TABLE inventory_event
  ADD CONSTRAINT chk_event_override_requires_reason
  CHECK (cost_override_cents IS NULL OR cost_override_reason IS NOT NULL);

-- Constraint: gratis requires a reason
ALTER TABLE inventory_event
  ADD CONSTRAINT chk_event_gratis_requires_reason
  CHECK (is_gratis = false OR gratis_reason IS NOT NULL);

-- Indexes for financial reporting
CREATE INDEX idx_inv_event_gratis ON inventory_event(facility_id, is_gratis)
  WHERE is_gratis = true;
CREATE INDEX idx_inv_event_override ON inventory_event(facility_id, cost_override_reason)
  WHERE cost_override_reason IS NOT NULL;
CREATE INDEX idx_inv_event_vendor ON inventory_event(provided_by_vendor_id)
  WHERE provided_by_vendor_id IS NOT NULL;

-- ============================================================================
-- DATA DICTIONARY (for reference)
-- ============================================================================
--
-- vendor.vendor_type:
--   MANUFACTURER   - Makes the product
--   DISTRIBUTOR    - Resells/ships product
--   LOANER_PROVIDER - Provides loaner sets
--   CONSIGNMENT    - Owns consigned inventory in facility
--
-- ownership_type:
--   OWNED      - Facility purchased and owns outright
--   CONSIGNED  - Vendor owns; facility pays on use
--   LOANER     - Temporary; must be returned to vendor
--   GRATIS     - Provided at no cost (sample, demo, concession)
--
-- source_event_type:
--   PURCHASED            - Normal procurement
--   CONSIGNMENT_RECEIVED - Consignment stock arrival
--   LOANER_RECEIVED      - Loaner set received for case
--   SAMPLE               - Vendor sample
--   TRANSFER             - From another facility (future)
--
-- cost_override_reason:
--   CATALOG_ERROR        - Catalog cost was wrong
--   NEGOTIATED_DISCOUNT  - One-time vendor discount
--   VENDOR_CONCESSION    - Vendor absorbed cost
--   DAMAGE_CREDIT        - Credit for damaged goods
--   EXPIRED_CREDIT       - Credit for expired items
--   CONTRACT_ADJUSTMENT  - Reflects contracted rate
--   GRATIS_CONVERSION    - Sample used clinically
--   OTHER                - Requires cost_override_note
--
-- gratis_reason:
--   VENDOR_SAMPLE        - Evaluation sample
--   VENDOR_SUPPORT       - Rep provided to support case
--   CLINICAL_TRIAL       - Trial/study item
--   GOODWILL             - Vendor relationship gesture
--   WARRANTY_REPLACEMENT - Replaced defective item
--   OTHER                - Requires note
--
-- inventory_event financial fields:
--   cost_snapshot_cents         - Catalog cost frozen at event time
--   cost_override_cents         - Actual cost if different from snapshot
--   cost_override_reason        - Why override was applied
--   cost_override_note          - Free-text justification
--   provided_by_vendor_id       - Which vendor provided/supported
--   provided_by_rep_name        - Rep name (denormalized for audit)
--   is_gratis                   - Item was provided at no cost
--   gratis_reason               - Why item was gratis
--   financial_attestation_user_id - Who approved the override
