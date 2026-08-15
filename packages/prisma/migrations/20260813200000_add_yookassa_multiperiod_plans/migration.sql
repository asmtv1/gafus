-- Keep WEEKLY for historical subscriptions, but make the new 14/30/90-day
-- YooKassa plan codes available for newly created payments and subscriptions.
ALTER TYPE "AppSubscriptionPlanCode" ADD VALUE IF NOT EXISTS 'TWO_WEEKS' AFTER 'WEEKLY';
ALTER TYPE "AppSubscriptionPlanCode" ADD VALUE IF NOT EXISTS 'THREE_MONTHS' AFTER 'MONTHLY';

ALTER TABLE "AppSubscriptionSettings"
  ADD COLUMN "twoWeeksEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "threeMonthsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "yookassaTwoWeeksPriceRub" DECIMAL(10, 2) NOT NULL DEFAULT 1490.00,
  ADD COLUMN "yookassaThreeMonthsPriceRub" DECIMAL(10, 2) NOT NULL DEFAULT 6490.00,
  ADD COLUMN "twoWeeksIntervalDays" INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN "threeMonthsIntervalDays" INTEGER NOT NULL DEFAULT 90;

-- Align the existing monthly setting with the public 30-day price. The two
-- new plans remain disabled until API and renewal-worker rollout is complete.
UPDATE "AppSubscriptionSettings"
SET
  "yookassaMonthlyPriceRub" = 2490.00,
  "monthlyIntervalDays" = 30,
  "twoWeeksEnabled" = false,
  "threeMonthsEnabled" = false,
  "yookassaTwoWeeksPriceRub" = 1490.00,
  "yookassaThreeMonthsPriceRub" = 6490.00,
  "twoWeeksIntervalDays" = 14,
  "threeMonthsIntervalDays" = 90;

ALTER TABLE "AppSubscriptionSettings"
  ALTER COLUMN "yookassaMonthlyPriceRub" SET DEFAULT 2490.00;
