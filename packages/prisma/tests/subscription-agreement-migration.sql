\set ON_ERROR_STOP on
-- Execute only against a disposable database: psql -f this file.
CREATE SCHEMA tariff_migration_test;
SET search_path TO tariff_migration_test;
CREATE TABLE "AppSubscriptionSettings" (
 key TEXT PRIMARY KEY, "yookassaWeeklyPriceRub" DECIMAL DEFAULT 200,
 "yookassaTwoWeeksPriceRub" DECIMAL DEFAULT 1490, "yookassaMonthlyPriceRub" DECIMAL DEFAULT 2490,
 "yookassaThreeMonthsPriceRub" DECIMAL DEFAULT 6490, currency TEXT DEFAULT 'RUB',
 "weeklyIntervalDays" INTEGER DEFAULT 7, "twoWeeksIntervalDays" INTEGER DEFAULT 14,
 "monthlyIntervalDays" INTEGER DEFAULT 30, "threeMonthsIntervalDays" INTEGER DEFAULT 90,
 "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "AppSubscription" (id TEXT PRIMARY KEY, provider TEXT, "planCode" TEXT);
CREATE TABLE "AppSubscriptionPayment" (
 id TEXT PRIMARY KEY, "subscriptionId" TEXT, provider TEXT, status TEXT, "planCode" TEXT,
 amount DECIMAL, "originalAmount" DECIMAL, currency TEXT, "periodStart" TIMESTAMP,
 "periodEnd" TIMESTAMP, "succeededAt" TIMESTAMP, "createdAt" TIMESTAMP
);
INSERT INTO "AppSubscriptionSettings" (key) VALUES ('default');
INSERT INTO "AppSubscription" VALUES
 ('old-trial','YOOKASSA','TWO_WEEKS'), ('old-full','YOOKASSA','THREE_MONTHS'),
 ('discounted','YOOKASSA','MONTHLY'), ('unpaid-trial','YOOKASSA','WEEKLY'),
 ('pending','YOOKASSA','THREE_MONTHS'), ('apple','APPLE','MONTHLY');
INSERT INTO "AppSubscriptionPayment" VALUES
 ('p1','old-trial','YOOKASSA','SUCCEEDED','TWO_WEEKS',1490,1490,'RUB','2026-01-01','2026-01-15','2026-01-01','2026-01-01'),
 ('p2','old-full','YOOKASSA','SUCCEEDED','THREE_MONTHS',5990,5990,'RUB','2026-01-01','2026-04-01','2026-01-01','2026-01-01'),
 ('p3','discounted','YOOKASSA','SUCCEEDED','MONTHLY',1992,2490,'RUB','2026-01-01','2026-01-31','2026-01-01','2026-01-01'),
 ('p4','old-full','YOOKASSA','SUCCEEDED','THREE_MONTHS',6490,6490,'RUB','2026-04-01','2026-06-30','2026-04-01','2026-04-01'),
 ('p5','pending','YOOKASSA','PENDING','THREE_MONTHS',6490,6490,'RUB','2026-10-04','2027-01-02',NULL,'2026-10-04');
\ir ../migrations/20261004120000_subscription_agreement_terms/migration.sql
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM "AppSubscription" WHERE id='old-trial' AND "renewalPriceRub"=1490 AND "renewalIntervalDays"=14 AND "planTitle"='Пробный') THEN RAISE EXCEPTION 'Legacy trial changed'; END IF;
 IF NOT EXISTS (SELECT FROM "AppSubscription" WHERE id='old-full' AND "renewalPriceRub"=5990 AND "renewalIntervalDays"=90 AND "planTitle"='3 месяца') THEN RAISE EXCEPTION 'First agreed full price not preserved'; END IF;
 IF NOT EXISTS (SELECT FROM "AppSubscription" WHERE id='discounted' AND "renewalPriceRub"=2490 AND "renewalIntervalDays"=30) THEN RAISE EXCEPTION 'First-payment-only promo became recurring'; END IF;
 IF NOT EXISTS (SELECT FROM "AppSubscription" WHERE id='unpaid-trial' AND "renewalPriceRub"=200 AND "renewalIntervalDays"=7) THEN RAISE EXCEPTION 'Old free trial renewal changed'; END IF;
 IF NOT EXISTS (SELECT FROM "AppSubscription" WHERE id='pending' AND "renewalIntervalDays"=90) THEN RAISE EXCEPTION 'Pending legacy period changed'; END IF;
 IF NOT EXISTS (SELECT FROM "AppSubscriptionPayment" WHERE id='p5' AND amount=6490 AND "periodEnd"='2027-01-02' AND "planTitle"='3 месяца') THEN RAISE EXCEPTION 'Pending checkout changed'; END IF;
 IF NOT EXISTS (SELECT FROM "AppSubscription" WHERE id='apple' AND "renewalPriceRub" IS NULL AND "planTitle" IS NULL) THEN RAISE EXCEPTION 'Apple agreement changed'; END IF;
 IF NOT EXISTS (SELECT FROM "AppSubscriptionSettings" WHERE key='default' AND "yookassaTwoWeeksPriceRub"=1185 AND "twoWeeksIntervalDays"=30 AND "yookassaMonthlyPriceRub"=1465 AND "yookassaThreeMonthsPriceRub"=2470 AND "threeMonthsIntervalDays"=30) THEN RAISE EXCEPTION 'New catalogue incorrect'; END IF;
END $$;
INSERT INTO "AppSubscriptionSettings" (key) VALUES ('new-defaults');
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM "AppSubscriptionSettings" WHERE key='new-defaults' AND "yookassaTwoWeeksPriceRub"=1185 AND "twoWeeksIntervalDays"=30 AND "yookassaMonthlyPriceRub"=1465 AND "yookassaThreeMonthsPriceRub"=2470 AND "threeMonthsIntervalDays"=30) THEN RAISE EXCEPTION 'New defaults incorrect'; END IF;
END $$;
DROP SCHEMA tariff_migration_test CASCADE;
