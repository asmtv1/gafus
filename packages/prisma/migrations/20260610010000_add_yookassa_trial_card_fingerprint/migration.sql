ALTER TABLE "AppSubscriptionTrial"
  ADD COLUMN IF NOT EXISTS "paymentMethodFingerprintHash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "trialUnavailableReason" VARCHAR(64);

CREATE INDEX IF NOT EXISTS "AppSubscriptionTrial_provider_paymentMethodFingerprintHash_idx"
  ON "AppSubscriptionTrial"("provider", "paymentMethodFingerprintHash");
