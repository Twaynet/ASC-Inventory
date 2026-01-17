-- Add review tracking columns to case_card_feedback table
-- Allows administrators to review and act on feedback from debrief

-- Add review tracking columns
ALTER TABLE case_card_feedback
  ADD COLUMN reviewed_at TIMESTAMPTZ,
  ADD COLUMN reviewed_by_user_id UUID REFERENCES app_user(id),
  ADD COLUMN review_notes TEXT,
  ADD COLUMN review_action VARCHAR(20);

-- Index for finding pending reviews
CREATE INDEX idx_case_card_feedback_pending ON case_card_feedback(case_card_id) WHERE reviewed_at IS NULL;
CREATE INDEX idx_case_card_feedback_reviewed ON case_card_feedback(reviewed_at DESC) WHERE reviewed_at IS NOT NULL;
