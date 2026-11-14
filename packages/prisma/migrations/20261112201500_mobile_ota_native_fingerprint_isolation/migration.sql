-- Bind each OTA deployment to one verified native composition fingerprint.
-- Existing unbound rows are paused; never silently serve them to a new binary.
ALTER TABLE "MobileOtaDeployment"
  ADD COLUMN "nativeFingerprint" VARCHAR(64) NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000';

UPDATE "MobileOtaDeployment" d
SET "nativeFingerprint" = n."nativeFingerprint"
FROM "MobileOtaRelease" r
JOIN "MobileNativeRelease" n ON n.id = r."nativeReleaseId"
WHERE d."activeReleaseId" = r.id AND n.verified = true
  AND n."appId" = d."appId"
  AND n.platform = d.platform AND n.environment = d.environment
  AND n.channel = d.channel AND n."runtimeVersion" = d."runtimeVersion"
  AND n."signingKeyId" = d."signingKeyId";

UPDATE "MobileOtaDeployment"
SET paused = true, "rolloutPercent" = 0
WHERE "nativeFingerprint" = '0000000000000000000000000000000000000000000000000000000000000000';

ALTER TABLE "MobileOtaDeployment" ALTER COLUMN "nativeFingerprint" DROP DEFAULT;
DROP INDEX "mobile_ota_deployment_unique";
CREATE UNIQUE INDEX "mobile_ota_deployment_unique"
  ON "MobileOtaDeployment"("appId",platform,environment,channel,"runtimeVersion","signingKeyId","nativeFingerprint");
