-- CreateEnum
CREATE TYPE "RewardedPlatform" AS ENUM ('ANDROID', 'IOS', 'WEB_DESKTOP', 'WEB_TOUCH');

-- CreateEnum
CREATE TYPE "RewardedProvider" AS ENUM ('YANDEX');

-- CreateEnum
CREATE TYPE "RewardedAdSessionStatus" AS ENUM ('CREATED', 'LOADED', 'SHOWN', 'REWARDED', 'GRANTED', 'DISMISSED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RewardedCreditTransactionType" AS ENUM ('EARN', 'SPEND', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RewardedTargetType" AS ENUM ('ARTICLE', 'COURSE_STEP', 'DAILY_COURSE_STEP', 'CONSULTATION_BOOKING');

-- CreateTable
CREATE TABLE "RewardedAdSettings" (
    "key" VARCHAR(32) NOT NULL DEFAULT 'default',
    "androidEnabled" BOOLEAN NOT NULL DEFAULT false,
    "iosEnabled" BOOLEAN NOT NULL DEFAULT false,
    "webDesktopEnabled" BOOLEAN NOT NULL DEFAULT false,
    "webTouchEnabled" BOOLEAN NOT NULL DEFAULT false,
    "paywallCtaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyAdLimit" INTEGER NOT NULL DEFAULT 1,
    "yandexAndroidPlacementId" TEXT,
    "yandexIosPlacementId" TEXT,
    "yandexWebDesktopBlockId" TEXT,
    "yandexWebTouchBlockId" TEXT,
    "testMode" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardedAdSettings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "RewardedCreditWallet" (
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "pendingRefundCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardedCreditWallet_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "RewardedAdSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "RewardedPlatform" NOT NULL,
    "provider" "RewardedProvider" NOT NULL DEFAULT 'YANDEX',
    "placementId" TEXT NOT NULL,
    "status" "RewardedAdSessionStatus" NOT NULL DEFAULT 'CREATED',
    "targetType" "RewardedTargetType",
    "targetId" TEXT,
    "requestNonceHash" TEXT NOT NULL,
    "providerPayload" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rewardedAt" TIMESTAMP(3),
    "grantedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardedAdSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardedCreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "RewardedCreditTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "targetType" "RewardedTargetType",
    "targetId" TEXT,
    "provider" "RewardedProvider",
    "sessionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "refundedTransactionId" TEXT,
    "refundReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardedCreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardedAdEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardedAdEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RewardedAdSession_requestNonceHash_key" ON "RewardedAdSession"("requestNonceHash");

-- CreateIndex
CREATE INDEX "RewardedAdSession_userId_createdAt_idx" ON "RewardedAdSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RewardedAdSession_userId_status_expiresAt_idx" ON "RewardedAdSession"("userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "RewardedAdSession_platform_status_createdAt_idx" ON "RewardedAdSession"("platform", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RewardedCreditTransaction_idempotencyKey_key" ON "RewardedCreditTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RewardedCreditTransaction_userId_createdAt_idx" ON "RewardedCreditTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RewardedCreditTransaction_userId_type_createdAt_idx" ON "RewardedCreditTransaction"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "RewardedCreditTransaction_userId_targetType_targetId_idx" ON "RewardedCreditTransaction"("userId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "RewardedCreditTransaction_sessionId_idx" ON "RewardedCreditTransaction"("sessionId");

-- CreateIndex
CREATE INDEX "RewardedAdEvent_sessionId_createdAt_idx" ON "RewardedAdEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "RewardedAdEvent_eventType_createdAt_idx" ON "RewardedAdEvent"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "RewardedAdSettings" ADD CONSTRAINT "RewardedAdSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardedCreditWallet" ADD CONSTRAINT "RewardedCreditWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardedAdSession" ADD CONSTRAINT "RewardedAdSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardedCreditTransaction" ADD CONSTRAINT "RewardedCreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardedCreditTransaction" ADD CONSTRAINT "RewardedCreditTransaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RewardedAdSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardedAdEvent" ADD CONSTRAINT "RewardedAdEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RewardedAdSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Raw constraints not expressible in Prisma schema.
ALTER TABLE "RewardedCreditWallet"
  ADD CONSTRAINT "RewardedCreditWallet_balance_range"
  CHECK ("balance" >= 0 AND "balance" <= 5),
  ADD CONSTRAINT "RewardedCreditWallet_pending_refund_non_negative"
  CHECK ("pendingRefundCredits" >= 0);

ALTER TABLE "RewardedCreditTransaction"
  ADD CONSTRAINT "RewardedCreditTransaction_amount_positive"
  CHECK ("amount" > 0);

ALTER TABLE "RewardedAdSettings"
  ADD CONSTRAINT "RewardedAdSettings_daily_limit_allowed"
  CHECK ("dailyAdLimit" IN (1, 2, 3));

INSERT INTO "RewardedAdSettings" (
  "key",
  "androidEnabled",
  "iosEnabled",
  "webDesktopEnabled",
  "webTouchEnabled",
  "paywallCtaEnabled",
  "dailyAdLimit",
  "testMode",
  "updatedAt"
) VALUES (
  'default',
  false,
  false,
  false,
  false,
  false,
  1,
  true,
  CURRENT_TIMESTAMP
) ON CONFLICT ("key") DO NOTHING;
