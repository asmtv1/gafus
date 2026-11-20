-- Drop transient OAuth grants/contexts only; all User, subscription, course,
-- purchase, account and historical profile records remain intact.
DROP TABLE IF EXISTS "VkLoginGrant";
DROP TABLE IF EXISTS "VkRegistrationContext";
DROP TABLE IF EXISTS "VkIdOneTimeLogin";
DROP TYPE IF EXISTS "VkLoginGrantPurpose";
DROP TYPE IF EXISTS "VkRegistrationContextPurpose";

-- A single public configuration applies equally to every iOS/Android build.
ALTER TABLE "AppFeatureFlag" DROP COLUMN IF EXISTS "reviewEnabled";
ALTER TABLE "MobileAppReleasePolicy" DROP COLUMN IF EXISTS "iosReviewVersion";

-- Retired VK and iOS checkout flags are no longer addressable.
DELETE FROM "AppFeatureFlag" WHERE "key" IN (
  'mobile_vk_login_ios',
  'mobile_ios_ru_card_payment',
  'mobile_ios_ru_card_payment_hint',
  'mobile_ios_subscription_promo_codes'
);
