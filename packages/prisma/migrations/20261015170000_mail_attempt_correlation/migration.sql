-- Preserve legacy request bodies for pre-existing Resend idempotency keys.
-- Only newly created attempts opt into correlation tags (version 1).
ALTER TABLE "TransactionalMailAttempt"
  ADD COLUMN "correlationVersion" INTEGER NOT NULL DEFAULT 0;
