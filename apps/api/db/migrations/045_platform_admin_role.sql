-- Migration 045: PLATFORM_ADMIN Role Foundation (Part 1)
-- Implements LAW §3.1-3.2: PLATFORM_ADMIN is a no-tenant identity
--
-- This migration adds PLATFORM_ADMIN to user_role enum.
-- Part 2 (046) adds the constraint after enum value is committed.

-- Add PLATFORM_ADMIN to user_role enum
-- Must be first value to indicate highest privilege level
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'PLATFORM_ADMIN' BEFORE 'ADMIN';
