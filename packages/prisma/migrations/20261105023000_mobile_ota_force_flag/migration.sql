-- Независимый переключатель обязательного OTA, без изменений Store Force Update.
ALTER TABLE "MobileAppReleasePolicy"
  ADD COLUMN "otaRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "otaVersion" VARCHAR(48),
  ADD COLUMN "otaPlatform" VARCHAR(16) NOT NULL DEFAULT 'all';
ALTER TABLE "MobileAppReleasePolicy"
  ADD CONSTRAINT "MobileAppReleasePolicy_otaPlatform_check"
  CHECK ("otaPlatform" IN ('all', 'ios', 'android'));
ALTER TABLE "MobileAppReleasePolicy"
  ADD CONSTRAINT "MobileAppReleasePolicy_otaRequired_version_check"
  CHECK (NOT "otaRequired" OR "otaVersion" IS NOT NULL);
