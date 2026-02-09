-- Add active/inactive soft-delete to locations (mirrors rooms pattern)
ALTER TABLE location ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX idx_location_active ON location(facility_id, is_active);
