BEGIN;
ALTER TABLE "MobileOtaRelease" ADD COLUMN "signingExpiresAt" timestamp(3), ADD COLUMN "releaseTitle" varchar(100), ADD COLUMN "recoveryFor" integer, ADD COLUMN "allowsCheckout" boolean NOT NULL DEFAULT false;
DROP INDEX "mobile_ota_revision_unique";
CREATE UNIQUE INDEX "mobile_ota_native_revision_unique" ON "MobileOtaRelease" ("nativeReleaseId",revision);
CREATE TABLE "MobileOtaPublication" (
  platform varchar(12) NOT NULL, "runtimeVersion" varchar(100) NOT NULL, sequence integer NOT NULL,
  "commandHash" varchar(64) NOT NULL, "operationId" uuid NOT NULL UNIQUE, "actorId" text NOT NULL, action text NOT NULL CHECK (action IN ('TEST','ALL','STOP','RECOVER')),
  public boolean NOT NULL, required boolean NOT NULL, revision integer NOT NULL,
  title varchar(100) NOT NULL, "releaseIds" uuid[] NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(platform,"runtimeVersion",sequence)
);
CREATE TABLE "MobileOtaInstallationObservation" (
  identity varchar(64) PRIMARY KEY, "nativeReleaseId" uuid NOT NULL, "currentUpdateId" uuid, "observedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ota_observation_age" ON "MobileOtaInstallationObservation" ("observedAt");
COMMIT;
