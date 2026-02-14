-- 065: Add post-expiry welcome email tracking
-- Tracks whether the "welcome back" email has been sent after demo expiry.

ALTER TABLE demo_account
  ADD COLUMN post_expiry_welcome_sent_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN demo_account.post_expiry_welcome_sent_at
  IS 'Timestamp when the post-expiry welcome email was sent; NULL = not yet sent';
