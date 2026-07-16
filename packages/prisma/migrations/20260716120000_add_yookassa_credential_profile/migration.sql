ALTER TABLE "AppSubscription"
ADD COLUMN "yookassaCredentialProfile" VARCHAR(32);

ALTER TABLE "AppSubscriptionPayment"
ADD COLUMN "yookassaCredentialProfile" VARCHAR(32);
