-- Migration: Add color field for surgeons
-- Description: Allows assigning display colors to surgeons for visual distinction in UI

-- Add color column to app_user table
ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS display_color VARCHAR(7) DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN app_user.display_color IS 'Hex color code for visual distinction in UI (e.g., #3B82F6)';

-- Create index for quick lookup of surgeons with colors
CREATE INDEX IF NOT EXISTS idx_app_user_display_color ON app_user(display_color) WHERE display_color IS NOT NULL;
