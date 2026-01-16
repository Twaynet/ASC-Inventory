-- Migration: Add voiding capability to attestations
-- Allows attestations to be voided while maintaining audit trail

-- Add voiding columns
ALTER TABLE attestation
  ADD COLUMN voided_at TIMESTAMPTZ,
  ADD COLUMN voided_by_user_id UUID REFERENCES app_user(id);

-- Create index for filtering non-voided attestations
CREATE INDEX idx_attestation_voided ON attestation(case_id) WHERE voided_at IS NULL;

-- Drop the old simple update prevention trigger
DROP TRIGGER IF EXISTS attestation_no_update ON attestation;

-- Create a new trigger function that allows only voiding operations
CREATE OR REPLACE FUNCTION attestation_allow_void_only()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow voiding: setting voided_at and voided_by_user_id from NULL to a value
  IF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL THEN
    -- Ensure no other fields are being changed
    IF OLD.id = NEW.id
      AND OLD.facility_id = NEW.facility_id
      AND OLD.case_id = NEW.case_id
      AND OLD.type = NEW.type
      AND OLD.attested_by_user_id = NEW.attested_by_user_id
      AND OLD.readiness_state_at_time = NEW.readiness_state_at_time
      AND (OLD.notes IS NOT DISTINCT FROM NEW.notes)
      AND OLD.created_at = NEW.created_at
    THEN
      RETURN NEW;
    END IF;
  END IF;

  -- All other modifications are blocked
  RAISE EXCEPTION 'Only voiding is allowed on attestation table. Cannot modify other fields.';
END;
$$ LANGUAGE plpgsql;

-- Apply the new trigger
CREATE TRIGGER attestation_allow_void_only
  BEFORE UPDATE ON attestation
  FOR EACH ROW EXECUTE FUNCTION attestation_allow_void_only();

-- Comment for documentation
COMMENT ON COLUMN attestation.voided_at IS 'Timestamp when this attestation was voided. NULL means active.';
COMMENT ON COLUMN attestation.voided_by_user_id IS 'User who voided this attestation. NULL means not voided.';
