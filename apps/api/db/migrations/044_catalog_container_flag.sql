-- Migration: Add is_container flag to item_catalog
-- LAW Reference: docs/LAW/catalog.md - Set/Tray/Kit distinction
-- Change Type: Additive (new column with backfill)
--
-- PURPOSE:
-- Explicitly distinguish container-like catalog items (Sets, Trays, Kits)
-- from content items (Implants, Consumables, single Instruments).
--
-- This enables:
-- 1. UX clarity: Only containers appear as selectable "set parents"
-- 2. API enforcement: Prevent non-containers from having set definitions
-- 3. Semantic correctness: Category = WHAT it is, Container = its ROLE
--
-- Examples:
--   - "Vendor Specialty Tray - Spine" → is_container = true
--   - "Power Drill System" → is_container = true (EQUIPMENT that holds components)
--   - "Acetabular Cup - 54mm" → is_container = false
--   - "Hip Stem - Size 12" → is_container = false

-- ============================================================================
-- STEP 1: Add the column
-- ============================================================================

ALTER TABLE item_catalog ADD COLUMN is_container BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- STEP 2: Backfill - Items with existing components ARE containers
-- ============================================================================

UPDATE item_catalog
SET is_container = true, updated_at = NOW()
WHERE id IN (SELECT DISTINCT set_catalog_id FROM catalog_set_component);

-- ============================================================================
-- STEP 3: Backfill - Items with container-like names (conservative heuristic)
-- Only for items not already marked as containers
-- ============================================================================

UPDATE item_catalog
SET is_container = true, updated_at = NOW()
WHERE is_container = false
  AND (
    name ILIKE '% tray%' OR
    name ILIKE '%tray %' OR
    name ILIKE '% set%' OR
    name ILIKE '%set %' OR
    name ILIKE '% kit%' OR
    name ILIKE '%kit %' OR
    name ILIKE '% system%' OR
    name ILIKE '%system %' OR
    name ILIKE '% pack%' OR
    name ILIKE '%pack %' OR
    name ILIKE '% assembly%' OR
    name ILIKE '%assembly %'
  )
  -- Exclude common false positives
  AND NOT (
    name ILIKE '%offset%' OR   -- "Offset" contains "set"
    name ILIKE '%reset%' OR    -- "Reset" contains "set"
    name ILIKE '%asset%' OR    -- "Asset" contains "set"
    name ILIKE '%setting%'     -- "Setting" contains "set"
  );

-- ============================================================================
-- STEP 4: Add index for efficient filtering
-- ============================================================================

CREATE INDEX idx_catalog_container ON item_catalog(facility_id, is_container) WHERE is_container = true;

-- ============================================================================
-- STEP 5: Documentation
-- ============================================================================

COMMENT ON COLUMN item_catalog.is_container IS
  'LAW: If true, this catalog item is a container (Set/Tray/Kit) that can have expected contents defined via catalog_set_component. Implants, consumables, and single instruments should have is_container=false. Category describes WHAT the item is; is_container describes its ROLE.';
