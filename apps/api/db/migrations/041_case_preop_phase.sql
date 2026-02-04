-- Migration: Case PreOp Phase (Part 1)
-- Description: Add IN_PREOP status enum value

-- Add IN_PREOP to case_status enum
-- This must be in its own transaction before using the value
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'IN_PREOP';
