-- Registration reliability data contracts. This migration is additive for existing users
-- and partner history: no random referral code is turned into a discounted promo code.

ALTER TABLE "User"
  ADD COLUMN "registrationPending" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "savedRegistrationPromoCodeId" TEXT;

ALTER TABLE "PartnerProfile"
  ALTER COLUMN "referralCode" DROP NOT NULL,
  ADD COLUMN "promoCodeId" TEXT;

CREATE UNIQUE INDEX "PartnerProfile_promoCodeId_key" ON "PartnerProfile"("promoCodeId");
CREATE INDEX "User_savedRegistrationPromoCodeId_idx" ON "User"("savedRegistrationPromoCodeId");

ALTER TABLE "User"
  ADD CONSTRAINT "User_savedRegistrationPromoCodeId_fkey"
  FOREIGN KEY ("savedRegistrationPromoCodeId") REFERENCES "AppSubscriptionPromoCode"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerProfile"
  ADD CONSTRAINT "PartnerProfile_promoCodeId_fkey"
  FOREIGN KEY ("promoCodeId") REFERENCES "AppSubscriptionPromoCode"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TYPE "RegistrationEmailAttemptResult" AS ENUM (
  'SUCCEEDED', 'USERNAME_TAKEN', 'EMAIL_TAKEN', 'VALIDATION_ERROR'
);

CREATE TABLE "RegistrationEmailAttempt" (
  "id" TEXT NOT NULL,
  "tempSessionId" VARCHAR(128) NOT NULL,
  "dataFingerprint" VARCHAR(64) NOT NULL,
  "userId" TEXT,
  "result" "RegistrationEmailAttemptResult",
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegistrationEmailAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RegistrationEmailAttempt_tempSessionId_key" ON "RegistrationEmailAttempt"("tempSessionId");
CREATE INDEX "RegistrationEmailAttempt_dataFingerprint_idx" ON "RegistrationEmailAttempt"("dataFingerprint");
CREATE INDEX "RegistrationEmailAttempt_userId_idx" ON "RegistrationEmailAttempt"("userId");
ALTER TABLE "RegistrationEmailAttempt" ADD CONSTRAINT "RegistrationEmailAttempt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "VkRegistrationContextPurpose" AS ENUM ('REGISTER', 'LOGIN', 'LINK_ACCOUNT');
CREATE TYPE "VkLoginGrantPurpose" AS ENUM ('LOGIN', 'REGISTRATION_CONSENT');

CREATE TABLE "VkRegistrationContext" (
  "id" TEXT NOT NULL,
  "contextTokenHash" VARCHAR(64) NOT NULL,
  "stateHash" VARCHAR(64) NOT NULL,
  "codeVerifier" VARCHAR(128) NOT NULL,
  "purpose" "VkRegistrationContextPurpose" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "selectedPromoCodeId" TEXT,
  "userId" TEXT,
  "resultUserId" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VkRegistrationContext_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VkRegistrationContext_contextTokenHash_key" ON "VkRegistrationContext"("contextTokenHash");
CREATE UNIQUE INDEX "VkRegistrationContext_stateHash_key" ON "VkRegistrationContext"("stateHash");
CREATE INDEX "VkRegistrationContext_expiresAt_idx" ON "VkRegistrationContext"("expiresAt");
CREATE INDEX "VkRegistrationContext_userId_expiresAt_idx" ON "VkRegistrationContext"("userId", "expiresAt");
CREATE INDEX "VkRegistrationContext_resultUserId_idx" ON "VkRegistrationContext"("resultUserId");
CREATE INDEX "VkRegistrationContext_selectedPromoCodeId_idx" ON "VkRegistrationContext"("selectedPromoCodeId");
ALTER TABLE "VkRegistrationContext" ADD CONSTRAINT "VkRegistrationContext_selectedPromoCodeId_fkey"
  FOREIGN KEY ("selectedPromoCodeId") REFERENCES "AppSubscriptionPromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VkRegistrationContext" ADD CONSTRAINT "VkRegistrationContext_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VkRegistrationContext" ADD CONSTRAINT "VkRegistrationContext_resultUserId_fkey"
  FOREIGN KEY ("resultUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "VkLoginGrant" (
  "id" TEXT NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "userId" TEXT NOT NULL,
  "purpose" "VkLoginGrantPurpose" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consentCompletedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "reissuedFromId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VkLoginGrant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VkLoginGrant_tokenHash_key" ON "VkLoginGrant"("tokenHash");
CREATE INDEX "VkLoginGrant_userId_expiresAt_idx" ON "VkLoginGrant"("userId", "expiresAt");
CREATE INDEX "VkLoginGrant_expiresAt_idx" ON "VkLoginGrant"("expiresAt");
CREATE INDEX "VkLoginGrant_reissuedFromId_idx" ON "VkLoginGrant"("reissuedFromId");
ALTER TABLE "VkLoginGrant" ADD CONSTRAINT "VkLoginGrant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Legacy one-time VK tokens must not become valid in the new grant path.
UPDATE "VkIdOneTimeLogin"
SET "expiresAt" = CURRENT_TIMESTAMP, "consumedAt" = COALESCE("consumedAt", CURRENT_TIMESTAMP)
WHERE "consumedAt" IS NULL;
