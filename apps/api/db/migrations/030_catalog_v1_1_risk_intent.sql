-- Migration: Catalog v1.1 Risk-Intent Extensions
-- LAW Reference: docs/LAW/catalog.md Amendment v1.1
-- Change Type: Additive (no removals, no behavioral relaxations)
--
-- Adds risk-intent properties for alarms and readiness reasoning.
-- These are INTENT signals only - Catalog does not store physical state.

-- Create criticality enum
CREATE TYPE criticality AS ENUM (
  'CRITICAL',
  'IMPORTANT',
  'ROUTINE'
);

-- Add v1.1 fields to item_catalog
ALTER TABLE item_catalog
  ADD COLUMN requires_lot_tracking BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN requires_serial_tracking BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN requires_expiration_tracking BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN criticality criticality NOT NULL DEFAULT 'ROUTINE',
  ADD COLUMN readiness_required BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN expiration_warning_days INTEGER DEFAULT NULL,
  ADD COLUMN substitutable BOOLEAN NOT NULL DEFAULT false;

-- Add index for criticality filtering (common query pattern for alarms)
CREATE INDEX idx_catalog_criticality ON item_catalog(facility_id, criticality);

-- Add index for readiness filtering
CREATE INDEX idx_catalog_readiness ON item_catalog(facility_id, readiness_required) WHERE active = true;

COMMENT ON COLUMN item_catalog.requires_lot_tracking IS 'v1.1: Inventory must capture lot number for instances of this item';
COMMENT ON COLUMN item_catalog.requires_serial_tracking IS 'v1.1: Inventory must capture serial number for instances of this item';
COMMENT ON COLUMN item_catalog.requires_expiration_tracking IS 'v1.1: Inventory must capture expiration date for instances of this item';
COMMENT ON COLUMN item_catalog.criticality IS 'v1.1: Alarm severity classification (CRITICAL/IMPORTANT/ROUTINE)';
COMMENT ON COLUMN item_catalog.readiness_required IS 'v1.1: Item expected for case readiness evaluation';
COMMENT ON COLUMN item_catalog.expiration_warning_days IS 'v1.1: Days before expiration to trigger warnings (null = no early warning)';
COMMENT ON COLUMN item_catalog.substitutable IS 'v1.1: Substitution may satisfy readiness requirements';
