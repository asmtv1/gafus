-- Web rewarded ads are no longer supported. Remove their sessions before
-- narrowing the enum; related events cascade and transaction session links are set to NULL.
DELETE FROM "RewardedAdSession"
WHERE "platform" IN ('WEB_DESKTOP', 'WEB_TOUCH');

ALTER TABLE "RewardedAdSettings"
  DROP COLUMN "webDesktopEnabled",
  DROP COLUMN "webTouchEnabled",
  DROP COLUMN "yandexWebDesktopBlockId",
  DROP COLUMN "yandexWebTouchBlockId";

ALTER TYPE "RewardedPlatform" RENAME TO "RewardedPlatform_old";
CREATE TYPE "RewardedPlatform" AS ENUM ('ANDROID', 'IOS');
ALTER TABLE "RewardedAdSession"
  ALTER COLUMN "platform" TYPE "RewardedPlatform"
  USING ("platform"::text::"RewardedPlatform");
DROP TYPE "RewardedPlatform_old";
