ALTER TABLE "AppSubscription"
  ADD COLUMN IF NOT EXISTS "yookassaPaymentMethodLast4" VARCHAR(4),
  ADD COLUMN IF NOT EXISTS "yookassaPaymentMethodTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "renewalReminderSentForPeriodEnd" TIMESTAMP(3);
