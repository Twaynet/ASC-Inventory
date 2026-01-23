-- Migration: Room-based Scheduling
-- Description: Add room assignment to cases, block time feature, and room day configuration

-- Add room_id to surgical_case (estimated_duration_minutes already exists from 012)
ALTER TABLE surgical_case
  ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES room(id),
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Set default for existing estimated_duration_minutes if null
UPDATE surgical_case SET estimated_duration_minutes = 60 WHERE estimated_duration_minutes IS NULL;
ALTER TABLE surgical_case ALTER COLUMN estimated_duration_minutes SET DEFAULT 60;

CREATE INDEX IF NOT EXISTS idx_case_room ON surgical_case(room_id);
CREATE INDEX IF NOT EXISTS idx_case_room_date ON surgical_case(room_id, scheduled_date);

-- Block time table for scheduling gaps/holds
CREATE TABLE IF NOT EXISTS block_time (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  facility_id UUID NOT NULL REFERENCES facility(id),
  room_id UUID NOT NULL REFERENCES room(id),
  block_date DATE NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID REFERENCES app_user(id)
);

CREATE INDEX IF NOT EXISTS idx_block_time_room_date ON block_time(room_id, block_date);

-- Room day configuration (per-date start times)
CREATE TABLE IF NOT EXISTS room_day_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES room(id),
  config_date DATE NOT NULL,
  start_time TIME NOT NULL DEFAULT '07:30',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_id, config_date)
);

CREATE INDEX IF NOT EXISTS idx_room_day_config_date ON room_day_config(config_date);

-- Add comments for documentation
COMMENT ON COLUMN surgical_case.room_id IS 'Operating room assignment for the case';
COMMENT ON COLUMN surgical_case.sort_order IS 'Order within the room for the day';
COMMENT ON TABLE block_time IS 'Blocked time slots in operating rooms';
COMMENT ON TABLE room_day_config IS 'Per-date configuration for operating rooms (start times)';
