-- Migration: Add facility_key for multi-facility login
-- Users specify facility key + username + password to log in

-- Add facility_key column
ALTER TABLE facility ADD COLUMN facility_key VARCHAR(20);

-- Set default for existing facility
UPDATE facility SET facility_key = 'ASC-00001' WHERE facility_key IS NULL;

-- Make it NOT NULL and UNIQUE after setting defaults
ALTER TABLE facility ALTER COLUMN facility_key SET NOT NULL;
ALTER TABLE facility ADD CONSTRAINT facility_key_unique UNIQUE (facility_key);

-- Index for login lookups
CREATE INDEX idx_facility_key ON facility(facility_key);

-- Add comment
COMMENT ON COLUMN facility.facility_key IS 'Unique identifier users enter during login (e.g., ASC-00001)';
