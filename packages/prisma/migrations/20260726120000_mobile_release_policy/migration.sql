ALTER TABLE "AppFeatureFlag"
ADD COLUMN "reviewEnabled" BOOLEAN;

CREATE TABLE "MobileAppReleasePolicy" (
    "key" VARCHAR(32) NOT NULL DEFAULT 'default',
    "iosReviewVersion" VARCHAR(32),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileAppReleasePolicy_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "MobileAppReleasePolicy"
ADD CONSTRAINT "MobileAppReleasePolicy_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "MobileAppReleasePolicy" (
    "key",
    "iosReviewVersion",
    "revision",
    "createdAt",
    "updatedAt"
)
VALUES ('default', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

UPDATE "AppFeatureFlag"
SET "reviewEnabled" = FALSE
WHERE "key" IN (
    'mobile_vk_login_ios',
    'mobile_ios_ru_card_payment_hint',
    'mobile_ios_ru_card_payment'
);

INSERT INTO "AppFeatureFlag" ("key", "enabled", "reviewEnabled", "updatedAt")
SELECT
    'mobile_rewarded_ads_ios',
    COALESCE(
        (SELECT "iosEnabled" FROM "RewardedAdSettings" WHERE "key" = 'default'),
        FALSE
    ),
    FALSE,
    CURRENT_TIMESTAMP
ON CONFLICT ("key") DO UPDATE
SET
    "reviewEnabled" = COALESCE("AppFeatureFlag"."reviewEnabled", FALSE),
    "updatedAt" = CURRENT_TIMESTAMP;
