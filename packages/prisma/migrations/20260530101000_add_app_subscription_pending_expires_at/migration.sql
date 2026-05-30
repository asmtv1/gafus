ALTER TABLE "AppSubscription" ADD COLUMN "pendingExpiresAt" TIMESTAMP(3);

CREATE INDEX "AppSubscription_provider_status_pendingExpiresAt_idx"
  ON "AppSubscription"("provider", "status", "pendingExpiresAt");
