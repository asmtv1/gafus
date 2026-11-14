CREATE TABLE "MobileNativeReleaseAuditEvent" (
  "id" UUID NOT NULL,
  "nativeReleaseId" UUID NOT NULL,
  "operationId" VARCHAR(120) NOT NULL,
  "action" VARCHAR(28) NOT NULL,
  "actorId" VARCHAR(100) NOT NULL,
  "evidence" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileNativeReleaseAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MobileNativeReleaseAuditEvent_operationId_key" ON "MobileNativeReleaseAuditEvent"("operationId");
CREATE INDEX "MobileNativeReleaseAuditEvent_nativeReleaseId_createdAt_idx" ON "MobileNativeReleaseAuditEvent"("nativeReleaseId", "createdAt");
ALTER TABLE "MobileNativeReleaseAuditEvent" ADD CONSTRAINT "MobileNativeReleaseAuditEvent_nativeReleaseId_fkey"
  FOREIGN KEY ("nativeReleaseId") REFERENCES "MobileNativeRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
