-- Migration: Add attestation IDs to readiness cache
-- Needed for void functionality in the UI

ALTER TABLE case_readiness_cache
  ADD COLUMN attestation_id UUID,
  ADD COLUMN surgeon_acknowledgment_id UUID;

COMMENT ON COLUMN case_readiness_cache.attestation_id IS 'ID of the latest CASE_READINESS attestation for this case';
COMMENT ON COLUMN case_readiness_cache.surgeon_acknowledgment_id IS 'ID of the latest SURGEON_ACKNOWLEDGMENT for this case';
