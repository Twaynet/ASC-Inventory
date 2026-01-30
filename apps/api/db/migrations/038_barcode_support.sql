-- Migration 038: Barcode support
-- Adds catalog_identifier table for optional barcode/GTIN references
-- Adds barcode parsed fields and attestation columns to inventory_item

-- Catalog identifier table (optional, non-authoritative)
CREATE TABLE catalog_identifier (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  catalog_id UUID NOT NULL REFERENCES item_catalog(id) ON DELETE CASCADE,
  identifier_type TEXT NOT NULL,  -- REF, GTIN, BARCODE, UPC
  raw_value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',  -- manual, scan
  classification TEXT NOT NULL DEFAULT 'unknown',  -- gs1-datamatrix, gs1-128, code128, upc-a, unknown
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID REFERENCES app_user(id),
  UNIQUE(facility_id, catalog_id, identifier_type, raw_value)
);

CREATE INDEX idx_catalog_identifier_catalog ON catalog_identifier(catalog_id);
CREATE INDEX idx_catalog_identifier_gtin ON catalog_identifier(facility_id, raw_value)
  WHERE identifier_type = 'GTIN';

-- Inventory barcode parsed fields + attestation
ALTER TABLE inventory_item
  ADD COLUMN barcode_classification TEXT DEFAULT NULL,
  ADD COLUMN barcode_gtin VARCHAR(14) DEFAULT NULL,
  ADD COLUMN barcode_parsed_lot VARCHAR(255) DEFAULT NULL,
  ADD COLUMN barcode_parsed_serial VARCHAR(255) DEFAULT NULL,
  ADD COLUMN barcode_parsed_expiration DATE DEFAULT NULL,
  ADD COLUMN attestation_reason TEXT DEFAULT NULL,
  ADD COLUMN attested_by_user_id UUID REFERENCES app_user(id),
  ADD COLUMN attested_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX idx_inventory_barcode_gtin ON inventory_item(facility_id, barcode_gtin)
  WHERE barcode_gtin IS NOT NULL;
