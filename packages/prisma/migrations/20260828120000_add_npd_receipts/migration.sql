-- NPD fiscalization is forward-only: no historical subscription payments are
-- backfilled into this contour. A receipt is created only for payments handled
-- after this migration is deployed.

ALTER TABLE "AppSubscriptionPayment"
  ADD COLUMN "buyerEmail" VARCHAR(320);

CREATE TYPE "NpdConnectionStatus" AS ENUM ('ACTIVE', 'REAUTH_REQUIRED', 'DISABLED');
CREATE TYPE "NpdReceiptStatus" AS ENUM ('PENDING', 'ISSUED', 'CANCEL_PENDING', 'CANCELED', 'RECONCILIATION_REQUIRED', 'FAILED');
CREATE TYPE "NpdReceiptOperationType" AS ENUM ('CREATE', 'CANCEL');
CREATE TYPE "NpdReceiptOperationStatus" AS ENUM ('PENDING', 'PROCESSING', 'RETRY', 'SUCCEEDED', 'NOT_REQUIRED', 'RECONCILIATION_REQUIRED', 'FAILED');
CREATE TYPE "NpdReceiptEmailDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD_LETTER', 'SKIPPED');

-- The schema intentionally stores no access token, login/password, or SMS
-- credential. The refresh token is stored only as authenticated ciphertext.
CREATE TABLE "NpdConnection" (
  "id" VARCHAR(32) NOT NULL DEFAULT 'default',
  "inn" VARCHAR(12) NOT NULL,
  "deviceId" VARCHAR(128) NOT NULL,
  "refreshTokenCipher" BYTEA NOT NULL,
  "refreshTokenIv" BYTEA NOT NULL,
  "refreshTokenTag" BYTEA NOT NULL,
  "refreshTokenKeyVersion" INTEGER NOT NULL,
  "status" "NpdConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "fiscalizationStartedAt" TIMESTAMP(3),
  "lastAuthorizedAt" TIMESTAMP(3),
  "lastSuccessfulOperationAt" TIMESTAMP(3),
  "lastRefreshedAt" TIMESTAMP(3),
  "lastErrorCode" VARCHAR(64),
  "lastErrorRedacted" VARCHAR(1024),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NpdConnection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NpdConnection_singleton_check" CHECK ("id" = 'default'),
  CONSTRAINT "NpdConnection_inn_check" CHECK ("inn" ~ '^[0-9]{12}$'),
  CONSTRAINT "NpdConnection_device_id_check" CHECK (length(btrim("deviceId")) > 0),
  CONSTRAINT "NpdConnection_refresh_token_key_version_check" CHECK ("refreshTokenKeyVersion" > 0),
  CONSTRAINT "NpdConnection_refresh_token_cipher_check" CHECK (octet_length("refreshTokenCipher") > 0),
  CONSTRAINT "NpdConnection_refresh_token_iv_check" CHECK (octet_length("refreshTokenIv") > 0),
  CONSTRAINT "NpdConnection_refresh_token_tag_check" CHECK (octet_length("refreshTokenTag") > 0)
);

CREATE TABLE "NpdReceipt" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "connectionId" VARCHAR(32) NOT NULL DEFAULT 'default',
  "status" "NpdReceiptStatus" NOT NULL DEFAULT 'PENDING',
  "amountKopecks" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'RUB',
  "planCode" "AppSubscriptionPlanCode" NOT NULL,
  "intervalDays" INTEGER NOT NULL,
  "serviceName" VARCHAR(256) NOT NULL,
  "buyerEmail" VARCHAR(320),
  "providerReceiptId" VARCHAR(128),
  "operationAt" TIMESTAMP(3) NOT NULL,
  "printUrl" VARCHAR(2048),
  "jsonUrl" VARCHAR(2048),
  "issuedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "cancellationReason" VARCHAR(256),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NpdReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NpdReceipt_currency_check" CHECK ("currency" = 'RUB'),
  CONSTRAINT "NpdReceipt_amount_kopecks_check" CHECK ("amountKopecks" > 0),
  CONSTRAINT "NpdReceipt_interval_days_check" CHECK ("intervalDays" IN (14, 30, 90)),
  CONSTRAINT "NpdReceipt_plan_interval_check" CHECK (
    ("planCode" = 'TWO_WEEKS' AND "intervalDays" = 14)
    OR ("planCode" = 'MONTHLY' AND "intervalDays" = 30)
    OR ("planCode" = 'THREE_MONTHS' AND "intervalDays" = 90)
  ),
  CONSTRAINT "NpdReceipt_service_name_check" CHECK (length(btrim("serviceName")) > 0),
  CONSTRAINT "NpdReceipt_urls_paired_check" CHECK (
    ("printUrl" IS NULL) = ("jsonUrl" IS NULL)
  ),
  CONSTRAINT "NpdReceipt_issued_urls_check" CHECK (
    "status" <> 'ISSUED' OR ("printUrl" IS NOT NULL AND "jsonUrl" IS NOT NULL)
  )
);

CREATE TABLE "NpdReceiptOperation" (
  "id" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "type" "NpdReceiptOperationType" NOT NULL,
  "status" "NpdReceiptOperationStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" VARCHAR(128),
  "leaseExpiresAt" TIMESTAMP(3),
  "providerRequestId" VARCHAR(128),
  "completedAt" TIMESTAMP(3),
  "lastErrorCode" VARCHAR(64),
  "lastErrorRedacted" VARCHAR(1024),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NpdReceiptOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NpdReceiptOperation_attempt_count_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "NpdReceiptOperation_lease_check" CHECK (
    ("leaseOwner" IS NULL) = ("leaseExpiresAt" IS NULL)
  )
);

CREATE TABLE "NpdReceiptEmailDelivery" (
  "id" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "status" "NpdReceiptEmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "recipientEmail" VARCHAR(320) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" VARCHAR(128),
  "leaseExpiresAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "providerMessageId" VARCHAR(128),
  "lastErrorCode" VARCHAR(64),
  "lastErrorRedacted" VARCHAR(1024),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NpdReceiptEmailDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NpdReceiptEmailDelivery_attempt_count_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "NpdReceiptEmailDelivery_recipient_email_check" CHECK (length(btrim("recipientEmail")) > 0),
  CONSTRAINT "NpdReceiptEmailDelivery_lease_check" CHECK (
    ("leaseOwner" IS NULL) = ("leaseExpiresAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "NpdReceipt_paymentId_key" ON "NpdReceipt"("paymentId");
CREATE UNIQUE INDEX "NpdReceipt_providerReceiptId_key" ON "NpdReceipt"("providerReceiptId");
CREATE UNIQUE INDEX "NpdReceiptOperation_receiptId_type_key" ON "NpdReceiptOperation"("receiptId", "type");
CREATE UNIQUE INDEX "NpdReceiptEmailDelivery_receiptId_key" ON "NpdReceiptEmailDelivery"("receiptId");

CREATE INDEX "NpdReceipt_connectionId_status_createdAt_idx"
  ON "NpdReceipt"("connectionId", "status", "createdAt");
CREATE INDEX "NpdReceipt_status_createdAt_idx"
  ON "NpdReceipt"("status", "createdAt");
CREATE INDEX "NpdReceiptOperation_status_nextAttemptAt_leaseExpiresAt_idx"
  ON "NpdReceiptOperation"("status", "nextAttemptAt", "leaseExpiresAt");
CREATE INDEX "NpdReceiptOperation_receiptId_status_idx"
  ON "NpdReceiptOperation"("receiptId", "status");
CREATE INDEX "NpdReceiptEmailDelivery_status_nextAttemptAt_leaseExpiresAt_idx"
  ON "NpdReceiptEmailDelivery"("status", "nextAttemptAt", "leaseExpiresAt");

ALTER TABLE "NpdReceipt"
  ADD CONSTRAINT "NpdReceipt_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "AppSubscriptionPayment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "NpdReceipt_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "NpdConnection"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NpdReceiptOperation"
  ADD CONSTRAINT "NpdReceiptOperation_receiptId_fkey"
  FOREIGN KEY ("receiptId") REFERENCES "NpdReceipt"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NpdReceiptEmailDelivery"
  ADD CONSTRAINT "NpdReceiptEmailDelivery_receiptId_fkey"
  FOREIGN KEY ("receiptId") REFERENCES "NpdReceipt"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
