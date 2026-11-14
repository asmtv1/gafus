-- Minimal client-reported OTA lifecycle events (pseudonymous, no PII/log text).
CREATE TABLE "MobileOtaTelemetryEvent" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "installationHash" VARCHAR(64) NOT NULL,
  platform VARCHAR(12) NOT NULL,
  environment VARCHAR(24) NOT NULL,
  channel VARCHAR(48) NOT NULL,
  "runtimeVersion" VARCHAR(100) NOT NULL,
  "nativeFingerprint" VARCHAR(64) NOT NULL,
  "updateId" UUID,
  event VARCHAR(32) NOT NULL,
  "failureCode" VARCHAR(40),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileOtaTelemetryEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MobileOtaTelemetryEvent_eventId_key" ON "MobileOtaTelemetryEvent"("eventId");
CREATE INDEX "MobileOtaTelemetryEvent_createdAt_idx" ON "MobileOtaTelemetryEvent"("createdAt");
CREATE INDEX "mobile_ota_telemetry_lookup_idx"
  ON "MobileOtaTelemetryEvent"(platform,environment,"runtimeVersion","updateId",event,"createdAt");
CREATE INDEX "MobileOtaTelemetryEvent_installationHash_createdAt_idx"
  ON "MobileOtaTelemetryEvent"("installationHash","createdAt");
ALTER TABLE "MobileOtaTelemetryEvent" ADD CONSTRAINT "MobileOtaTelemetryEvent_event_check"
  CHECK (event IN ('LAUNCHED','CHECKED','DOWNLOADED','UPDATE_ERROR','ROLLBACK_DETECTED'));
