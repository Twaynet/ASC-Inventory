-- ASC Inventory Truth System v1.1
-- Initial Schema Migration
--
-- IMPORTANT: InventoryEvent and Attestation tables are APPEND-ONLY.
-- No UPDATE or DELETE operations allowed on these tables.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE user_role AS ENUM (
  'ADMIN',
  'SCHEDULER',
  'INVENTORY_TECH',
  'CIRCULATOR',
  'SURGEON'
);

CREATE TYPE case_status AS ENUM (
  'DRAFT',
  'SCHEDULED',
  'READY',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE readiness_state AS ENUM (
  'GREEN',
  'ORANGE',
  'RED'
);

CREATE TYPE item_category AS ENUM (
  'IMPLANT',
  'INSTRUMENT',
  'LOANER',
  'HIGH_VALUE_SUPPLY'
);

CREATE TYPE sterility_status AS ENUM (
  'STERILE',
  'NON_STERILE',
  'EXPIRED',
  'UNKNOWN'
);

CREATE TYPE availability_status AS ENUM (
  'AVAILABLE',
  'RESERVED',
  'IN_USE',
  'UNAVAILABLE',
  'MISSING'
);

CREATE TYPE inventory_event_type AS ENUM (
  'RECEIVED',
  'VERIFIED',
  'LOCATION_CHANGED',
  'RESERVED',
  'RELEASED',
  'CONSUMED',
  'EXPIRED',
  'RETURNED',
  'ADJUSTED'
);

CREATE TYPE attestation_type AS ENUM (
  'CASE_READINESS',
  'SURGEON_ACKNOWLEDGMENT'
);

CREATE TYPE device_type AS ENUM (
  'barcode',
  'rfid',
  'nfc',
  'other'
);

CREATE TYPE device_payload_type AS ENUM (
  'scan',
  'presence',
  'input'
);

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Facility (multi-tenant root)
CREATE TABLE facility (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User (facility-scoped)
CREATE TABLE app_user (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role user_role NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, email)
);

CREATE INDEX idx_user_facility ON app_user(facility_id);
CREATE INDEX idx_user_role ON app_user(facility_id, role);

-- Location (hierarchical storage locations)
CREATE TABLE location (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  parent_location_id UUID REFERENCES location(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_location_facility ON location(facility_id);
CREATE INDEX idx_location_parent ON location(parent_location_id);

-- Item Catalog (what items can exist)
CREATE TABLE item_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category item_category NOT NULL,
  manufacturer VARCHAR(255),
  catalog_number VARCHAR(255),
  requires_sterility BOOLEAN NOT NULL DEFAULT true,
  is_loaner BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_catalog_facility ON item_catalog(facility_id);
CREATE INDEX idx_catalog_category ON item_catalog(facility_id, category);
CREATE INDEX idx_catalog_active ON item_catalog(facility_id, active);

-- Inventory Item (actual physical items)
CREATE TABLE inventory_item (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  catalog_id UUID NOT NULL REFERENCES item_catalog(id),
  serial_number VARCHAR(255),
  lot_number VARCHAR(255),
  barcode VARCHAR(255),
  location_id UUID REFERENCES location(id),
  sterility_status sterility_status NOT NULL DEFAULT 'UNKNOWN',
  sterility_expires_at TIMESTAMPTZ,
  availability_status availability_status NOT NULL DEFAULT 'AVAILABLE',
  reserved_for_case_id UUID, -- FK added after case table
  last_verified_at TIMESTAMPTZ,
  last_verified_by_user_id UUID REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_facility ON inventory_item(facility_id);
CREATE INDEX idx_inventory_catalog ON inventory_item(catalog_id);
CREATE INDEX idx_inventory_barcode ON inventory_item(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_inventory_location ON inventory_item(location_id);
CREATE INDEX idx_inventory_availability ON inventory_item(facility_id, availability_status);
CREATE INDEX idx_inventory_sterility ON inventory_item(facility_id, sterility_status, sterility_expires_at);
-- Critical for day-before queries: find available, sterile items
CREATE INDEX idx_inventory_readiness ON inventory_item(facility_id, catalog_id, availability_status, sterility_status);

-- Preference Card (surgeon's preferred items for procedure)
CREATE TABLE preference_card (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  surgeon_id UUID NOT NULL REFERENCES app_user(id),
  procedure_name VARCHAR(255) NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  current_version_id UUID, -- FK added after version table
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pref_card_facility ON preference_card(facility_id);
CREATE INDEX idx_pref_card_surgeon ON preference_card(surgeon_id);

-- Preference Card Version (immutable snapshots of preference card items)
CREATE TABLE preference_card_version (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  preference_card_id UUID NOT NULL REFERENCES preference_card(id),
  version_number INT NOT NULL,
  items JSONB NOT NULL, -- Array of {catalogId, quantity, notes}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID NOT NULL REFERENCES app_user(id),
  UNIQUE(preference_card_id, version_number)
);

CREATE INDEX idx_pref_version_card ON preference_card_version(preference_card_id);

-- Add FK for current_version_id
ALTER TABLE preference_card
  ADD CONSTRAINT fk_pref_card_current_version
  FOREIGN KEY (current_version_id) REFERENCES preference_card_version(id);

-- Case (scheduled surgical case)
CREATE TABLE surgical_case (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,
  surgeon_id UUID NOT NULL REFERENCES app_user(id),
  patient_mrn VARCHAR(50), -- Minimal PHI
  procedure_name VARCHAR(255) NOT NULL,
  preference_card_version_id UUID REFERENCES preference_card_version(id),
  status case_status NOT NULL DEFAULT 'DRAFT',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_case_facility ON surgical_case(facility_id);
CREATE INDEX idx_case_surgeon ON surgical_case(surgeon_id);
CREATE INDEX idx_case_status ON surgical_case(facility_id, status);
-- CRITICAL for day-before query: cases for tomorrow
CREATE INDEX idx_case_scheduled_date ON surgical_case(facility_id, scheduled_date, status);

-- Add FK for reserved_for_case_id
ALTER TABLE inventory_item
  ADD CONSTRAINT fk_inventory_reserved_case
  FOREIGN KEY (reserved_for_case_id) REFERENCES surgical_case(id);

-- Case Requirement (items required for a specific case)
CREATE TABLE case_requirement (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES surgical_case(id),
  catalog_id UUID NOT NULL REFERENCES item_catalog(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  is_surgeon_override BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(case_id, catalog_id)
);

CREATE INDEX idx_case_req_case ON case_requirement(case_id);
CREATE INDEX idx_case_req_catalog ON case_requirement(catalog_id);

-- ============================================================================
-- APPEND-ONLY EVENT TABLES (IMMUTABLE)
-- ============================================================================

-- Inventory Event (append-only audit log of inventory changes)
-- RULE: NO UPDATE, NO DELETE
CREATE TABLE inventory_event (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  inventory_item_id UUID NOT NULL REFERENCES inventory_item(id),
  event_type inventory_event_type NOT NULL,
  case_id UUID REFERENCES surgical_case(id),
  location_id UUID REFERENCES location(id),
  previous_location_id UUID REFERENCES location(id),
  sterility_status sterility_status,
  notes TEXT,
  performed_by_user_id UUID NOT NULL REFERENCES app_user(id),
  device_event_id UUID, -- FK added after device_event table
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No UPDATE trigger - append only
CREATE INDEX idx_inv_event_facility ON inventory_event(facility_id);
CREATE INDEX idx_inv_event_item ON inventory_event(inventory_item_id);
CREATE INDEX idx_inv_event_case ON inventory_event(case_id) WHERE case_id IS NOT NULL;
CREATE INDEX idx_inv_event_type ON inventory_event(facility_id, event_type);
CREATE INDEX idx_inv_event_occurred ON inventory_event(facility_id, occurred_at DESC);

-- Attestation (append-only record of attestations)
-- RULE: NO UPDATE, NO DELETE
CREATE TABLE attestation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  case_id UUID NOT NULL REFERENCES surgical_case(id),
  type attestation_type NOT NULL,
  attested_by_user_id UUID NOT NULL REFERENCES app_user(id),
  readiness_state_at_time readiness_state NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attestation_facility ON attestation(facility_id);
CREATE INDEX idx_attestation_case ON attestation(case_id);
CREATE INDEX idx_attestation_type ON attestation(case_id, type);

-- ============================================================================
-- DEVICE TABLES
-- ============================================================================

-- Device (registered scanning devices)
CREATE TABLE device (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  name VARCHAR(255) NOT NULL,
  device_type device_type NOT NULL,
  location_id UUID REFERENCES location(id),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_facility ON device(facility_id);

-- Device Event (raw events from devices - append-only)
CREATE TABLE device_event (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  device_id UUID NOT NULL REFERENCES device(id),
  device_type device_type NOT NULL,
  payload_type device_payload_type NOT NULL,
  raw_value TEXT NOT NULL,
  processed_item_id UUID REFERENCES inventory_item(id),
  processed BOOLEAN NOT NULL DEFAULT false,
  processing_error TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_event_facility ON device_event(facility_id);
CREATE INDEX idx_device_event_device ON device_event(device_id);
CREATE INDEX idx_device_event_processed ON device_event(facility_id, processed);

-- Add FK for device_event_id in inventory_event
ALTER TABLE inventory_event
  ADD CONSTRAINT fk_inv_event_device_event
  FOREIGN KEY (device_event_id) REFERENCES device_event(id);

-- ============================================================================
-- MATERIALIZED VIEW: Case Readiness Cache
--
-- JUSTIFICATION: Computed table (not database materialized view) because:
-- 1. PostgreSQL materialized views require REFRESH which blocks reads
-- 2. We need incremental updates when inventory changes
-- 3. Application-level cache allows fine-grained invalidation
-- 4. Day-before query is read-heavy, this pre-computes readiness
-- ============================================================================

CREATE TABLE case_readiness_cache (
  case_id UUID PRIMARY KEY REFERENCES surgical_case(id),
  facility_id UUID NOT NULL REFERENCES facility(id),
  scheduled_date DATE NOT NULL,
  procedure_name VARCHAR(255) NOT NULL,
  surgeon_name VARCHAR(255) NOT NULL,
  readiness_state readiness_state NOT NULL,
  missing_items JSONB NOT NULL DEFAULT '[]', -- Array of MissingItemReason
  total_required_items INT NOT NULL DEFAULT 0,
  total_verified_items INT NOT NULL DEFAULT 0,
  has_attestation BOOLEAN NOT NULL DEFAULT false,
  attested_at TIMESTAMPTZ,
  attested_by_name VARCHAR(255),
  has_surgeon_acknowledgment BOOLEAN NOT NULL DEFAULT false,
  surgeon_acknowledged_at TIMESTAMPTZ,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_readiness_cache_facility_date ON case_readiness_cache(facility_id, scheduled_date);
CREATE INDEX idx_readiness_cache_state ON case_readiness_cache(facility_id, readiness_state);

-- ============================================================================
-- PROTECTION: Prevent modifications to append-only tables
-- ============================================================================

-- Function to prevent updates/deletes
CREATE OR REPLACE FUNCTION prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Modifications not allowed on append-only table %', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

-- Protect inventory_event
CREATE TRIGGER inventory_event_no_update
  BEFORE UPDATE ON inventory_event
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER inventory_event_no_delete
  BEFORE DELETE ON inventory_event
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- Protect attestation
CREATE TRIGGER attestation_no_update
  BEFORE UPDATE ON attestation
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER attestation_no_delete
  BEFORE DELETE ON attestation
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- Protect device_event
CREATE TRIGGER device_event_no_update
  BEFORE UPDATE ON device_event
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE TRIGGER device_event_no_delete
  BEFORE DELETE ON device_event
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to mutable tables
CREATE TRIGGER facility_updated_at BEFORE UPDATE ON facility
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_updated_at BEFORE UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER location_updated_at BEFORE UPDATE ON location
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER item_catalog_updated_at BEFORE UPDATE ON item_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER inventory_item_updated_at BEFORE UPDATE ON inventory_item
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER preference_card_updated_at BEFORE UPDATE ON preference_card
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER surgical_case_updated_at BEFORE UPDATE ON surgical_case
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER case_requirement_updated_at BEFORE UPDATE ON case_requirement
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER device_updated_at BEFORE UPDATE ON device
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
