-- New purchases use only the monthly tariff. Historical weekly rows stay intact
-- so their already-agreed payment periods and reporting remain auditable.
UPDATE "AppSubscriptionSettings"
SET
  "weeklyEnabled" = false,
  "monthlyEnabled" = true,
  "yookassaMonthlyPriceRub" = 2500.00;

ALTER TABLE "AppSubscriptionSettings"
  ALTER COLUMN "weeklyEnabled" SET DEFAULT false,
  ALTER COLUMN "yookassaMonthlyPriceRub" SET DEFAULT 2500.00;
