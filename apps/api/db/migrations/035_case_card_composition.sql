-- 035_case_card_composition.sql
-- Add composition support to case_card_version so a case card can reference
-- one or more preference card versions and apply overrides.

ALTER TABLE case_card_version
  ADD COLUMN IF NOT EXISTS components    JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS overrides     JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS composed_cache JSONB;

-- Backfill is implicit via DEFAULT; existing rows already satisfy NOT NULL.

COMMENT ON COLUMN case_card_version.components IS 'Array of {preferenceCardVersionId, role?, label?} refs';
COMMENT ON COLUMN case_card_version.overrides  IS 'Array of {op, section?, match?, item?} patch ops applied after merge';
COMMENT ON COLUMN case_card_version.composed_cache IS 'Cached result of composeCaseCardVersion(); NULL = stale';
