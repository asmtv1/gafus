-- Additive operational telemetry: old clients retain their original wire.
ALTER TABLE "MobileOtaTelemetryEvent" DROP CONSTRAINT "MobileOtaTelemetryEvent_event_check",
  ADD CONSTRAINT "MobileOtaTelemetryEvent_event_check"
  CHECK (event IN ('LAUNCHED','CHECKED','DOWNLOADED','UPDATE_ERROR','ROLLBACK_DETECTED',
    'SIGNATURE_REJECTED','MANDATORY_ATTEMPT','MANDATORY_INCOMPLETE')) NOT VALID;
ALTER TABLE "MobileOtaTelemetryEvent" VALIDATE CONSTRAINT "MobileOtaTelemetryEvent_event_check";

-- Bound the recent synced walk cohort before probing the existing composite point PK.
CREATE INDEX "DogWalkRecord_gpsEnabled_createdAt_idx" ON "DogWalkRecord"("gpsEnabled", "createdAt");
