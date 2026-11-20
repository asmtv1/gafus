ALTER TYPE "AppSubscriptionProvider" ADD VALUE 'GOOGLE_PLAY';
ALTER TABLE "User" ADD COLUMN "googlePlayAccountId" VARCHAR(64);
CREATE UNIQUE INDEX "User_googlePlayAccountId_key" ON "User"("googlePlayAccountId");

ALTER TABLE "AppSubscription"
  ADD COLUMN "googlePlayPurchaseToken" TEXT,
  ADD COLUMN "googlePlaySupersededAt" TIMESTAMP(3),
  ADD COLUMN "googlePlayCheckedAt" TIMESTAMP(3),
  ADD COLUMN "googlePlayReplacesTokenHash" VARCHAR(64);
CREATE UNIQUE INDEX "AppSubscription_googlePlayPurchaseToken_key"
  ON "AppSubscription"("googlePlayPurchaseToken");
CREATE INDEX "AppSubscription_provider_googlePlayCheckedAt_idx"
  ON "AppSubscription"("provider", "googlePlayCheckedAt");
CREATE INDEX "AppSubscription_googlePlayReplacesTokenHash_idx"
  ON "AppSubscription"("googlePlayReplacesTokenHash");
