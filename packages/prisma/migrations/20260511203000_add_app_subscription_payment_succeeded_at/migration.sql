ALTER TABLE "AppSubscriptionPayment"
  ADD COLUMN IF NOT EXISTS "succeededAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "AppSubscriptionPayment_subscriptionId_status_succeededAt_idx"
  ON "AppSubscriptionPayment"("subscriptionId", "status", "succeededAt");
