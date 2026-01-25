-- Migration: Align item_category enum with LAW catalog.md v2.0
-- LAW Reference: docs/LAW/catalog.md Section 4A (Engine Category)
-- Change Type: Schema modification (enum values)
--
-- LAW states:
--   - Allowed categories: IMPLANT, INSTRUMENT, EQUIPMENT, MEDICATION, CONSUMABLE, PPE
--   - LOANER and HIGH_VALUE_SUPPLY are FORBIDDEN as categories
--   - Loaner status handled via is_loaner boolean (already exists)
--   - Supply Mode is a separate axis (future implementation)

-- ============================================================================
-- STEP 1: Add new enum values
-- ============================================================================

ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'EQUIPMENT';
ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'MEDICATION';
ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'CONSUMABLE';
ALTER TYPE item_category ADD VALUE IF NOT EXISTS 'PPE';

-- ============================================================================
-- STEP 2: Migrate existing data from deprecated categories
-- ============================================================================

-- LOANER → INSTRUMENT (and ensure is_loaner flag is set)
UPDATE item_catalog
SET category = 'INSTRUMENT', is_loaner = true, updated_at = NOW()
WHERE category = 'LOANER';

-- HIGH_VALUE_SUPPLY → CONSUMABLE
UPDATE item_catalog
SET category = 'CONSUMABLE', updated_at = NOW()
WHERE category = 'HIGH_VALUE_SUPPLY';

-- ============================================================================
-- STEP 3: Remove deprecated enum values
-- PostgreSQL requires recreating the enum to remove values.
-- We use a safe rename-and-replace approach.
-- ============================================================================

-- Create new enum with only LAW-compliant values
CREATE TYPE item_category_new AS ENUM (
  'IMPLANT',
  'INSTRUMENT',
  'EQUIPMENT',
  'MEDICATION',
  'CONSUMABLE',
  'PPE'
);

-- Alter column to use new enum
ALTER TABLE item_catalog
  ALTER COLUMN category TYPE item_category_new
  USING category::text::item_category_new;

-- Drop old enum and rename new one
DROP TYPE item_category;
ALTER TYPE item_category_new RENAME TO item_category;

-- ============================================================================
-- STEP 4: Add comment documenting LAW compliance
-- ============================================================================

COMMENT ON TYPE item_category IS 'LAW catalog.md v2.0 §4A: Engine Category. Values are immutable without LAW amendment.';
