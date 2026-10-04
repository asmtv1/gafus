-- Run with API checkout and renewal workers paused. Freeze old agreements before
-- changing catalogue settings, including payments awaiting a delayed webhook.
BEGIN;
LOCK TABLE "AppSubscription", "AppSubscriptionPayment", "AppSubscriptionSettings" IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE "AppSubscription"
  ADD COLUMN "renewalPriceRub" DECIMAL(12,3),
  ADD COLUMN "renewalIntervalDays" INTEGER,
  ADD COLUMN "renewalCurrency" VARCHAR(3),
  ADD COLUMN "planTitle" TEXT;
ALTER TABLE "AppSubscriptionPayment" ADD COLUMN "planTitle" TEXT;

UPDATE "AppSubscriptionPayment" SET "planTitle" = CASE "planCode"
  WHEN 'WEEKLY' THEN 'Недельный' WHEN 'TWO_WEEKS' THEN 'Пробный'
  WHEN 'MONTHLY' THEN 'Месяц' WHEN 'THREE_MONTHS' THEN '3 месяца' END
WHERE provider = 'YOOKASSA';

-- Never silently guess the original agreement for an existing paying customer.
DO $$ BEGIN
  IF EXISTS (
    SELECT FROM "AppSubscription" subscription
    JOIN LATERAL (
      SELECT p.* FROM "AppSubscriptionPayment" p
      WHERE p."subscriptionId" = subscription.id AND p.provider = 'YOOKASSA'
        AND p.status IN ('SUCCEEDED', 'REFUNDED')
      ORDER BY p."succeededAt" ASC NULLS LAST, p."createdAt" ASC, p.id ASC LIMIT 1
    ) payment ON true
    WHERE subscription.provider = 'YOOKASSA' AND (
      COALESCE(payment."originalAmount", payment.amount, 0) <= 0
      OR payment.currency IS DISTINCT FROM 'RUB'
      OR payment."periodStart" IS NULL OR payment."periodEnd" IS NULL
      OR payment."periodEnd" <= payment."periodStart"
    )
  ) THEN RAISE EXCEPTION 'Cannot freeze original subscription agreement: audit first successful payment terms before tariff rollout'; END IF;
END $$;

WITH agreements AS (
  SELECT subscription.id,
    COALESCE(payment."originalAmount", payment.amount,
      CASE subscription."planCode"
        WHEN 'WEEKLY' THEN COALESCE(settings."yookassaWeeklyPriceRub", 200)
        WHEN 'TWO_WEEKS' THEN COALESCE(settings."yookassaTwoWeeksPriceRub", 1490)
        WHEN 'MONTHLY' THEN COALESCE(settings."yookassaMonthlyPriceRub", 2490)
        WHEN 'THREE_MONTHS' THEN COALESCE(settings."yookassaThreeMonthsPriceRub", 6490)
      END) AS price,
    COALESCE(NULLIF(ROUND(EXTRACT(EPOCH FROM (payment."periodEnd" - payment."periodStart")) / 86400)::INTEGER, 0),
      CASE subscription."planCode"
        WHEN 'WEEKLY' THEN COALESCE(settings."weeklyIntervalDays", 7)
        WHEN 'TWO_WEEKS' THEN COALESCE(settings."twoWeeksIntervalDays", 14)
        WHEN 'MONTHLY' THEN COALESCE(settings."monthlyIntervalDays", 30)
        WHEN 'THREE_MONTHS' THEN COALESCE(settings."threeMonthsIntervalDays", 90)
      END) AS days,
    COALESCE(payment.currency, settings.currency, 'RUB') AS currency,
    CASE subscription."planCode"
      WHEN 'WEEKLY' THEN 'Недельный' WHEN 'TWO_WEEKS' THEN 'Пробный'
      WHEN 'MONTHLY' THEN 'Месяц' WHEN 'THREE_MONTHS' THEN '3 месяца' END AS title
  FROM "AppSubscription" subscription
  LEFT JOIN "AppSubscriptionSettings" settings ON settings.key = 'default'
  LEFT JOIN LATERAL (
    SELECT p.* FROM "AppSubscriptionPayment" p
    WHERE p."subscriptionId" = subscription.id AND p.provider = 'YOOKASSA'
      AND p.status IN ('SUCCEEDED', 'REFUNDED')
    ORDER BY p."succeededAt" ASC NULLS LAST, p."createdAt" ASC, p.id ASC
    LIMIT 1
  ) payment ON true
  WHERE subscription.provider = 'YOOKASSA'
)
UPDATE "AppSubscription" subscription SET
  "renewalPriceRub" = agreements.price, "renewalIntervalDays" = agreements.days,
  "renewalCurrency" = agreements.currency, "planTitle" = agreements.title
FROM agreements WHERE agreements.id = subscription.id;

ALTER TABLE "AppSubscription" ADD CONSTRAINT "AppSubscription_renewal_terms_positive"
  CHECK (("renewalPriceRub" IS NULL OR "renewalPriceRub" > 0)
    AND ("renewalIntervalDays" IS NULL OR "renewalIntervalDays" > 0));

ALTER TABLE "AppSubscriptionSettings"
  ALTER COLUMN "yookassaTwoWeeksPriceRub" SET DEFAULT 1185,
  ALTER COLUMN "yookassaMonthlyPriceRub" SET DEFAULT 1465,
  ALTER COLUMN "yookassaThreeMonthsPriceRub" SET DEFAULT 2470,
  ALTER COLUMN "twoWeeksIntervalDays" SET DEFAULT 30,
  ALTER COLUMN "threeMonthsIntervalDays" SET DEFAULT 30;
UPDATE "AppSubscriptionSettings" SET
  "yookassaTwoWeeksPriceRub" = 1185, "twoWeeksIntervalDays" = 30,
  "yookassaMonthlyPriceRub" = 1465, "monthlyIntervalDays" = 30,
  "yookassaThreeMonthsPriceRub" = 2470, "threeMonthsIntervalDays" = 30,
  "updatedAt" = CURRENT_TIMESTAMP WHERE key = 'default';
COMMIT;
