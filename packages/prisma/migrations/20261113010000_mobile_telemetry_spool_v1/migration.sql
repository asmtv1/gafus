-- Mobile/Web diagnostics: anonymous grants + durable, environment-scoped spool.
-- Additive only; old SDK 55 schemas and OTA endpoints remain unchanged.
CREATE TABLE "MobileTelemetryUploadSession" (
  "id" UUID NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "environment" VARCHAR(24) NOT NULL,
  "platform" VARCHAR(12) NOT NULL,
  "appVersion" VARCHAR(48) NOT NULL,
  "build" VARCHAR(40) NOT NULL,
  "channel" VARCHAR(48) NOT NULL,
  "nativeFingerprint" VARCHAR(64) NOT NULL,
  "runtimeVersion" VARCHAR(100) NOT NULL,
  "eventBudget" INTEGER NOT NULL DEFAULT 100,
  "usedEvents" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileTelemetryUploadSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MobileTelemetryUploadSession_events_nonnegative" CHECK ("usedEvents" >= 0 AND "usedEvents" <= "eventBudget")
);
CREATE UNIQUE INDEX "MobileTelemetryUploadSession_tokenHash_key" ON "MobileTelemetryUploadSession"("tokenHash");
CREATE INDEX "mobile_telemetry_session_expiry" ON "MobileTelemetryUploadSession"("expiresAt");

CREATE TABLE "MobileTelemetrySpool" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "environment" VARCHAR(24) NOT NULL,
  "service" VARCHAR(40) NOT NULL,
  "platform" VARCHAR(12) NOT NULL,
  "eventKind" VARCHAR(32) NOT NULL,
  "severity" VARCHAR(12) NOT NULL,
  "runtimeVersion" VARCHAR(100) NOT NULL,
  "updateId" VARCHAR(40) NOT NULL,
  "appVersion" VARCHAR(48) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" VARCHAR(80),
  "exportedAt" TIMESTAMP(3),
  "lastFailureCode" VARCHAR(40),
  "retentionUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileTelemetrySpool_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MobileTelemetrySpool_status_valid" CHECK ("status" IN ('PENDING', 'LEASED', 'EXPORTED', 'DEAD')),
  CONSTRAINT "MobileTelemetrySpool_attempts_nonnegative" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX "mobile_telemetry_spool_dedup" ON "MobileTelemetrySpool"("environment", "service", "eventId");
CREATE INDEX "mobile_telemetry_spool_ready" ON "MobileTelemetrySpool"("status", "availableAt", "lockedAt");
CREATE INDEX "mobile_telemetry_spool_expiry" ON "MobileTelemetrySpool"("retentionUntil");

-- Cumulative resource safety cap. Each insert batch reserves quota in the same
-- transaction as the payload, so a crash cannot acknowledge without quota.
CREATE TABLE "MobileTelemetryDailyQuota" (
  "environment" VARCHAR(24) NOT NULL,
  "day" DATE NOT NULL,
  "acceptedEvents" INTEGER NOT NULL DEFAULT 0,
  "acceptedBytes" BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT "MobileTelemetryDailyQuota_pkey" PRIMARY KEY ("environment", "day"),
  CONSTRAINT "MobileTelemetryDailyQuota_positive" CHECK ("acceptedEvents" >= 0 AND "acceptedBytes" >= 0)
);
