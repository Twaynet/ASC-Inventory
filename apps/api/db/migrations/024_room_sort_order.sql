-- Migration: Add sort_order to room table
-- Description: Allows admins to customize the display order of operating rooms

-- Add sort_order column to room table
ALTER TABLE room
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Initialize sort_order based on current name ordering (to preserve existing behavior)
WITH ordered_rooms AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY facility_id ORDER BY name) - 1 as new_order
  FROM room
)
UPDATE room
SET sort_order = ordered_rooms.new_order
FROM ordered_rooms
WHERE room.id = ordered_rooms.id;

-- Create index for efficient ordering
CREATE INDEX IF NOT EXISTS idx_room_sort_order ON room(facility_id, sort_order);

-- Add comment for documentation
COMMENT ON COLUMN room.sort_order IS 'Display order in UI (lower numbers appear first)';
