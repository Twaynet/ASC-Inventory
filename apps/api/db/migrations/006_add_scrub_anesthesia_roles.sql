-- Migration: Add SCRUB and ANESTHESIA roles to user_role enum
-- These roles are needed for conditional debrief signatures

-- Add SCRUB role if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SCRUB' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')) THEN
        ALTER TYPE user_role ADD VALUE 'SCRUB';
    END IF;
END$$;

-- Add ANESTHESIA role if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ANESTHESIA' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')) THEN
        ALTER TYPE user_role ADD VALUE 'ANESTHESIA';
    END IF;
END$$;
