CREATE TYPE "AppSubscriptionPlanCode" AS ENUM ('WEEKLY', 'MONTHLY');

ALTER TABLE "AppSubscriptionSettings"
  ADD COLUMN "weeklyEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "monthlyEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "yookassaMonthlyPriceRub" DECIMAL(10, 2) NOT NULL DEFAULT 1100.00,
  ADD COLUMN "weeklyIntervalDays" INTEGER,
  ADD COLUMN "monthlyIntervalDays" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "weeklyAppleProductId" TEXT,
  ADD COLUMN "monthlyAppleProductId" TEXT;

UPDATE "AppSubscriptionSettings"
SET
  "weeklyIntervalDays" = COALESCE("intervalDays", 7),
  "weeklyAppleProductId" = "appleProductId";

ALTER TABLE "AppSubscriptionSettings"
  ALTER COLUMN "weeklyIntervalDays" SET DEFAULT 7,
  ALTER COLUMN "weeklyIntervalDays" SET NOT NULL;

DROP INDEX IF EXISTS "AppSubscriptionSettings_appleProductId_key";

ALTER TABLE "AppSubscriptionSettings"
  DROP COLUMN "intervalDays",
  DROP COLUMN "appleProductId";

CREATE UNIQUE INDEX "AppSubscriptionSettings_weeklyAppleProductId_key"
  ON "AppSubscriptionSettings"("weeklyAppleProductId");

CREATE UNIQUE INDEX "AppSubscriptionSettings_monthlyAppleProductId_key"
  ON "AppSubscriptionSettings"("monthlyAppleProductId");

ALTER TABLE "AppSubscription"
  ADD COLUMN "planCode" "AppSubscriptionPlanCode" NOT NULL DEFAULT 'WEEKLY';

ALTER TABLE "AppSubscriptionPayment"
  ADD COLUMN "planCode" "AppSubscriptionPlanCode" NOT NULL DEFAULT 'WEEKLY';

CREATE INDEX "AppSubscription_planCode_idx" ON "AppSubscription"("planCode");
CREATE INDEX "AppSubscriptionPayment_planCode_idx" ON "AppSubscriptionPayment"("planCode");
