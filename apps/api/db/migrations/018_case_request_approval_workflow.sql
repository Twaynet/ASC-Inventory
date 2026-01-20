-- Migration: Case Request/Approval Workflow - Part 1
-- Description: Add REQUESTED and REJECTED statuses to case_status enum

-- Add REQUESTED and REJECTED to case_status enum
-- These must be in a separate transaction from their usage
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'REQUESTED';
ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'REJECTED';
