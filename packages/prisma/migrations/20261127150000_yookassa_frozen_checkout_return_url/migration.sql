-- Immutable callback URL needed to replay the exact same provider request.
-- Historical rows without it remain reconciliation-only; do not backfill guesses.
ALTER TABLE "AppSubscriptionPayment" ADD COLUMN "yookassaCheckoutReturnUrl" TEXT;
