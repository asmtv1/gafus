-- A mandatory OTA policy belongs to exactly one platform + native runtime.
-- Never overwrite Android when enabling iOS; versions before 1.7.5 are excluded by the API.
CREATE TABLE "MobileOtaMandatoryPolicy" (
  "platform" VARCHAR(12) NOT NULL,
  "runtimeVersion" VARCHAR(100) NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "version" VARCHAR(100),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileOtaMandatoryPolicy_pkey" PRIMARY KEY ("platform", "runtimeVersion"),
  CONSTRAINT "MobileOtaMandatoryPolicy_platform_check" CHECK ("platform" IN ('ios','android')),
  CONSTRAINT "MobileOtaMandatoryPolicy_version_check" CHECK (
    NOT "required" OR (
      "version" IS NOT NULL AND
      "version" ~ '^[0-9]+\.[0-9]+\.[0-9]+-ota\.[1-9][0-9]*$' AND
      "version" LIKE "runtimeVersion" || '-ota.%'
    )
  )
);

CREATE TABLE "MobileOtaMandatoryPolicyAudit" (
  "operationId" VARCHAR(120) NOT NULL PRIMARY KEY,
  "platform" VARCHAR(12) NOT NULL,
  "runtimeVersion" VARCHAR(100) NOT NULL,
  "previousRevision" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL,
  "required" BOOLEAN NOT NULL,
  "version" VARCHAR(100),
  "actorId" TEXT NOT NULL,
  "reason" VARCHAR(512) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One-time migration: preserve Android's live 1.7.5 mandatory revision 6.
-- No new iOS requirement is enabled unless the legacy flag already targeted iOS.
INSERT INTO "MobileOtaMandatoryPolicy" ("platform", "runtimeVersion", "required", "version")
SELECT p.platform, '1.7.5', TRUE, legacy."otaVersion"
FROM "MobileAppReleasePolicy" legacy
CROSS JOIN (VALUES ('ios'), ('android')) p(platform)
WHERE legacy.key='default' AND legacy."otaRequired"=TRUE
  AND (legacy."otaPlatform"='all' OR legacy."otaPlatform"=p.platform)
  AND legacy."otaVersion" ~ '^1\.7\.5-ota\.[1-9][0-9]*$'
ON CONFLICT ("platform", "runtimeVersion") DO NOTHING;
