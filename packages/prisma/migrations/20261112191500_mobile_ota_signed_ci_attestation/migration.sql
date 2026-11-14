-- Additive verification and idempotent build metadata for signed CI callbacks.
ALTER TABLE "MobileNativeRelease"
  ADD COLUMN "certificatePem" TEXT,
  ADD COLUMN "attestation" JSONB;
ALTER TABLE "MobileOtaRelease"
  ADD COLUMN "operationId" VARCHAR(120),
  ADD COLUMN "buildAttempt" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "ciRunId" VARCHAR(100),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "MobileOtaRelease_operationId_key" ON "MobileOtaRelease"("operationId");
