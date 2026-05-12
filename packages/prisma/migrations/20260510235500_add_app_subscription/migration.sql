-- App subscription domain
DO $$ BEGIN
  CREATE TYPE "AppSubscriptionProvider" AS ENUM ('YOOKASSA', 'APPLE', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "AppSubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'REFUNDED', 'REVOKED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "AppSubscriptionPaymentKind" AS ENUM ('INITIAL', 'RENEWAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "AppSubscriptionPaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'CANCELED', 'FAILED', 'REFUNDED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "AppSubscriptionEventSource" AS ENUM ('YOOKASSA', 'APPLE', 'ADMIN', 'SYSTEM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  CREATE TYPE "AppSubscriptionEventProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "appleAppAccountToken" VARCHAR(36);

CREATE UNIQUE INDEX IF NOT EXISTS "User_appleAppAccountToken_key"
  ON "User"("appleAppAccountToken");

CREATE TABLE IF NOT EXISTS "AppSubscriptionSettings" (
  "key" VARCHAR(32) NOT NULL,
  "yookassaWeeklyPriceRub" DECIMAL(10,2) NOT NULL DEFAULT 200.00,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'RUB',
  "intervalDays" INTEGER NOT NULL DEFAULT 7,
  "appleProductId" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppSubscriptionSettings_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "AppSubscriptionSettings_currency_check" CHECK ("currency" = 'RUB')
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppSubscriptionSettings_appleProductId_key"
  ON "AppSubscriptionSettings"("appleProductId");

CREATE TABLE IF NOT EXISTS "AppSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "AppSubscriptionProvider" NOT NULL,
  "status" "AppSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "isLifetime" BOOLEAN NOT NULL DEFAULT false,
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "canceledAt" TIMESTAMP(3),
  "yookassaPaymentMethodId" TEXT,
  "appleOriginalTransactionId" TEXT,
  "appleProductId" TEXT,
  "manualGrantedById" TEXT,
  "manualReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppSubscription_yookassaPaymentMethodId_key"
  ON "AppSubscription"("yookassaPaymentMethodId");
CREATE UNIQUE INDEX IF NOT EXISTS "AppSubscription_appleOriginalTransactionId_key"
  ON "AppSubscription"("appleOriginalTransactionId");

CREATE INDEX IF NOT EXISTS "AppSubscription_userId_status_currentPeriodEnd_idx"
  ON "AppSubscription"("userId", "status", "currentPeriodEnd");
CREATE INDEX IF NOT EXISTS "AppSubscription_provider_status_currentPeriodEnd_idx"
  ON "AppSubscription"("provider", "status", "currentPeriodEnd");
CREATE INDEX IF NOT EXISTS "AppSubscription_provider_status_cancelAtPeriodEnd_currentPeriodEnd_idx"
  ON "AppSubscription"("provider", "status", "cancelAtPeriodEnd", "currentPeriodEnd");
CREATE UNIQUE INDEX IF NOT EXISTS "AppSubscription_userId_provider_active_unique"
  ON "AppSubscription"("userId", "provider")
  WHERE "status" IN ('PENDING', 'ACTIVE', 'PAST_DUE');

CREATE TABLE IF NOT EXISTS "AppSubscriptionPayment" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "userId" TEXT NOT NULL,
  "provider" "AppSubscriptionProvider" NOT NULL,
  "kind" "AppSubscriptionPaymentKind" NOT NULL,
  "status" "AppSubscriptionPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(12,3),
  "currency" VARCHAR(3),
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "idempotenceKey" TEXT NOT NULL,
  "yookassaPaymentId" TEXT,
  "appleTransactionId" TEXT,
  "appleOriginalTransactionId" TEXT,
  "applePriceMilliunits" INTEGER,
  "appleStorefront" TEXT,
  "appleEnvironment" TEXT,
  "appleWebOrderLineItemId" TEXT,
  "confirmationUrl" TEXT,
  "failureCode" TEXT,
  "failureReason" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppSubscriptionPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppSubscriptionPayment_period_order_check" CHECK (
    "periodEnd" IS NULL OR "periodStart" IS NULL OR "periodEnd" > "periodStart"
  ),
  CONSTRAINT "AppSubscriptionPayment_yookassa_amount_check" CHECK (
    "provider" <> 'YOOKASSA' OR ("amount" IS NOT NULL AND "currency" = 'RUB')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppSubscriptionPayment_idempotenceKey_key"
  ON "AppSubscriptionPayment"("idempotenceKey");
CREATE UNIQUE INDEX IF NOT EXISTS "AppSubscriptionPayment_yookassaPaymentId_key"
  ON "AppSubscriptionPayment"("yookassaPaymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "AppSubscriptionPayment_appleTransactionId_key"
  ON "AppSubscriptionPayment"("appleTransactionId");
CREATE INDEX IF NOT EXISTS "AppSubscriptionPayment_userId_provider_status_idx"
  ON "AppSubscriptionPayment"("userId", "provider", "status");
CREATE INDEX IF NOT EXISTS "AppSubscriptionPayment_provider_status_nextAttemptAt_idx"
  ON "AppSubscriptionPayment"("provider", "status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "AppSubscriptionPayment_appleOriginalTransactionId_idx"
  ON "AppSubscriptionPayment"("appleOriginalTransactionId");

CREATE TABLE IF NOT EXISTS "AppSubscriptionEvent" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "userId" TEXT,
  "source" "AppSubscriptionEventSource" NOT NULL,
  "eventType" TEXT NOT NULL,
  "providerEventKey" TEXT,
  "idempotencyKey" TEXT,
  "payloadHash" TEXT,
  "processingStatus" "AppSubscriptionEventProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
  "processingAttempts" INTEGER NOT NULL DEFAULT 0,
  "lastProcessingError" TEXT,
  "actorId" TEXT,
  "metadata" JSONB,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppSubscriptionEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppSubscriptionEvent_providerEventKey_unique"
  ON "AppSubscriptionEvent"("providerEventKey")
  WHERE "providerEventKey" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "AppSubscriptionEvent_idempotencyKey_unique"
  ON "AppSubscriptionEvent"("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "AppSubscriptionEvent_source_eventType_createdAt_idx"
  ON "AppSubscriptionEvent"("source", "eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "AppSubscriptionEvent_processingStatus_createdAt_idx"
  ON "AppSubscriptionEvent"("processingStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "AppSubscriptionEvent_userId_createdAt_idx"
  ON "AppSubscriptionEvent"("userId", "createdAt");

ALTER TABLE "AppSubscriptionSettings"
  ADD CONSTRAINT "AppSubscriptionSettings_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AppSubscription"
  ADD CONSTRAINT "AppSubscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppSubscription"
  ADD CONSTRAINT "AppSubscription_manualGrantedById_fkey"
  FOREIGN KEY ("manualGrantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AppSubscriptionPayment"
  ADD CONSTRAINT "AppSubscriptionPayment_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "AppSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppSubscriptionPayment"
  ADD CONSTRAINT "AppSubscriptionPayment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppSubscriptionEvent"
  ADD CONSTRAINT "AppSubscriptionEvent_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "AppSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppSubscriptionEvent"
  ADD CONSTRAINT "AppSubscriptionEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppSubscriptionEvent"
  ADD CONSTRAINT "AppSubscriptionEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "AppSubscriptionSettings"
  ("key", "yookassaWeeklyPriceRub", "currency", "intervalDays", "createdAt", "updatedAt")
VALUES
  ('default', 200.00, 'RUB', 7, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
