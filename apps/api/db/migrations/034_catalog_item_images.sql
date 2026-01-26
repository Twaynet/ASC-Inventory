-- Migration: 034_catalog_item_images
-- Purpose: Add images to catalog items (documentation only, not evidence per LAW)
-- LAW Reference: catalog.md v2.1 Section E - Images are documentation, not evidence

-- Images attached to catalog items for human recognition
-- Images MUST NOT assert correctness, completeness, verification, or readiness
CREATE TABLE catalog_item_image (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  catalog_id UUID NOT NULL REFERENCES item_catalog(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'REFERENCE',  -- PRIMARY | REFERENCE
  caption TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  asset_url TEXT NOT NULL,  -- external URL or internal upload path
  source TEXT NOT NULL DEFAULT 'URL',  -- URL | UPLOAD
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_catalog_image_facility ON catalog_item_image(facility_id);
CREATE INDEX idx_catalog_image_catalog ON catalog_item_image(catalog_id);
CREATE INDEX idx_catalog_image_kind ON catalog_item_image(catalog_id, kind);

-- Ensure at most one PRIMARY image per catalog item per facility
CREATE UNIQUE INDEX idx_catalog_image_primary_unique
  ON catalog_item_image(facility_id, catalog_id)
  WHERE kind = 'PRIMARY';
