-- Migration: Add human-readable case_number (format: YY-NNNNN-C)
-- YY = 2-digit year of creation
-- NNNNN = 5-digit sequence per facility per year
-- C = Luhn check digit

-- Table to track yearly sequence per facility
CREATE TABLE IF NOT EXISTS case_number_sequence (
  facility_id UUID NOT NULL REFERENCES facility(id),
  year SMALLINT NOT NULL,
  last_sequence INT NOT NULL DEFAULT 0,
  PRIMARY KEY (facility_id, year)
);

-- Add case_number column to surgical_case
ALTER TABLE surgical_case
  ADD COLUMN case_number VARCHAR(12) UNIQUE;

-- Create index for searching by case_number
CREATE INDEX idx_case_number ON surgical_case(case_number);

-- Function to calculate Luhn check digit
CREATE OR REPLACE FUNCTION calculate_luhn_check_digit(digits TEXT)
RETURNS INT AS $$
DECLARE
  digit_array INT[];
  i INT;
  sum INT := 0;
  digit INT;
  doubled INT;
BEGIN
  -- Convert string to array of digits
  FOR i IN 1..length(digits) LOOP
    digit_array := array_append(digit_array, CAST(substring(digits FROM i FOR 1) AS INT));
  END LOOP;

  -- Process digits from right to left, doubling every second digit
  FOR i IN REVERSE array_length(digit_array, 1)..1 LOOP
    digit := digit_array[i];
    -- Double every second digit (from the right, so odd positions when reversed)
    IF (array_length(digit_array, 1) - i) % 2 = 0 THEN
      doubled := digit * 2;
      IF doubled > 9 THEN
        doubled := doubled - 9;
      END IF;
      sum := sum + doubled;
    ELSE
      sum := sum + digit;
    END IF;
  END LOOP;

  -- Check digit is (10 - (sum mod 10)) mod 10
  RETURN (10 - (sum % 10)) % 10;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to generate next case number for a facility
CREATE OR REPLACE FUNCTION generate_case_number(p_facility_id UUID, p_created_at TIMESTAMPTZ DEFAULT NOW())
RETURNS TEXT AS $$
DECLARE
  v_year SMALLINT;
  v_sequence INT;
  v_base_digits TEXT;
  v_check_digit INT;
  v_case_number TEXT;
BEGIN
  -- Extract 2-digit year
  v_year := EXTRACT(YEAR FROM p_created_at)::SMALLINT;

  -- Get and increment sequence (with locking)
  INSERT INTO case_number_sequence (facility_id, year, last_sequence)
  VALUES (p_facility_id, v_year, 1)
  ON CONFLICT (facility_id, year)
  DO UPDATE SET last_sequence = case_number_sequence.last_sequence + 1
  RETURNING last_sequence INTO v_sequence;

  -- Build base digits for Luhn: YY + NNNNN (7 digits total)
  v_base_digits := LPAD((v_year % 100)::TEXT, 2, '0') || LPAD(v_sequence::TEXT, 5, '0');

  -- Calculate check digit
  v_check_digit := calculate_luhn_check_digit(v_base_digits);

  -- Format: YY-NNNNN-C
  v_case_number := LPAD((v_year % 100)::TEXT, 2, '0') || '-' ||
                   LPAD(v_sequence::TEXT, 5, '0') || '-' ||
                   v_check_digit::TEXT;

  RETURN v_case_number;
END;
$$ LANGUAGE plpgsql;

-- Backfill existing cases with case_numbers based on created_at order
DO $$
DECLARE
  r RECORD;
  v_case_number TEXT;
BEGIN
  -- Process existing cases in order of creation
  FOR r IN
    SELECT id, facility_id, created_at
    FROM surgical_case
    WHERE case_number IS NULL
    ORDER BY created_at ASC
  LOOP
    v_case_number := generate_case_number(r.facility_id, r.created_at);
    UPDATE surgical_case SET case_number = v_case_number WHERE id = r.id;
  END LOOP;
END $$;

-- Make case_number NOT NULL after backfill
ALTER TABLE surgical_case
  ALTER COLUMN case_number SET NOT NULL;

-- Add comment
COMMENT ON COLUMN surgical_case.case_number IS 'Human-readable case number format: YY-NNNNN-C (year-sequence-checkdigit)';
