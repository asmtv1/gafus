ALTER TABLE "RewardedAdSettings"
  DROP CONSTRAINT IF EXISTS "RewardedAdSettings_daily_limit_allowed";

ALTER TABLE "RewardedAdSettings"
  ADD CONSTRAINT "RewardedAdSettings_daily_limit_allowed"
  CHECK ("dailyAdLimit" BETWEEN 0 AND 100);

CREATE INDEX "RewardedAdSession_userId_rewardedAt_idx"
  ON "RewardedAdSession"("userId", "rewardedAt");
