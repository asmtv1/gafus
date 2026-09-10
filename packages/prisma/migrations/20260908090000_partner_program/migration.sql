ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PARTNER';

CREATE TYPE "PartnerCommissionKind" AS ENUM ('EARNED', 'REFUND_ADJUSTMENT');
CREATE TYPE "PartnerPayoutStatus" AS ENUM ('PENDING', 'PAID', 'REJECTED');

CREATE TABLE "PartnerProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "referralCode" VARCHAR(32) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PartnerProfile_userId_key" ON "PartnerProfile"("userId");
CREATE UNIQUE INDEX "PartnerProfile_referralCode_key" ON "PartnerProfile"("referralCode");

CREATE TABLE "PartnerReferral" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerReferral_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PartnerReferral_buyerId_key" ON "PartnerReferral"("buyerId");
CREATE INDEX "PartnerReferral_partnerId_createdAt_idx" ON "PartnerReferral"("partnerId", "createdAt");

CREATE TABLE "PartnerCommission" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "amountKopecks" INTEGER NOT NULL,
  "kind" "PartnerCommissionKind" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerCommission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PartnerCommission_paymentId_kind_key" ON "PartnerCommission"("paymentId", "kind");
CREATE INDEX "PartnerCommission_partnerId_createdAt_idx" ON "PartnerCommission"("partnerId", "createdAt");

CREATE TABLE "PartnerPayout" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "amountKopecks" INTEGER NOT NULL,
  "status" "PartnerPayoutStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "note" VARCHAR(512),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerPayout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PartnerPayout_partnerId_status_requestedAt_idx" ON "PartnerPayout"("partnerId", "status", "requestedAt");

ALTER TABLE "PartnerProfile" ADD CONSTRAINT "PartnerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerReferral" ADD CONSTRAINT "PartnerReferral_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerReferral" ADD CONSTRAINT "PartnerReferral_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerCommission" ADD CONSTRAINT "PartnerCommission_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerCommission" ADD CONSTRAINT "PartnerCommission_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "AppSubscriptionPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerPayout" ADD CONSTRAINT "PartnerPayout_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
