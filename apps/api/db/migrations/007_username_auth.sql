-- Migration: Username-Based Authentication
-- Add username column and update constraints for login by username

-- Add username column
ALTER TABLE app_user ADD COLUMN username VARCHAR(100);

-- Backfill from email prefix (lowercase)
UPDATE app_user SET username = LOWER(SPLIT_PART(email, '@', 1));

-- Make username required
ALTER TABLE app_user ALTER COLUMN username SET NOT NULL;

-- Drop old unique constraint on email
ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_facility_id_email_key;

-- Add new unique constraint on username per facility
ALTER TABLE app_user ADD CONSTRAINT app_user_facility_id_username_key UNIQUE(facility_id, username);

-- Make email optional (required only for ADMIN)
ALTER TABLE app_user ALTER COLUMN email DROP NOT NULL;

-- Add index for username lookups
CREATE INDEX idx_user_username ON app_user(facility_id, LOWER(username));
