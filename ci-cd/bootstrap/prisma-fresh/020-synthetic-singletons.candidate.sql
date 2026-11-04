-- GAFUS ONLY-NEW-EMPTY-DB bootstrap seeds, no user records, no legacy backfills.
-- sources: 20260424143000, 20260510235500, 20260531140000,
--          20260726120000, 20261015020000 + final 20261004120000 tariff defaults.
-- AppSubscriptionSettings 20260510235500 original seed referenced retired
-- intervalDays; the current schema has weeklyIntervalDays/monthlyIntervalDays.
-- Current 200/1465/1185/2470 RUB and 7/30/30/30 days are DB defaults,
-- verified against schema output by assemble.py.
INSERT INTO "AppSubscriptionSettings" ("key", "updatedAt")
  VALUES ('default', CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING;

-- Old web reward flags no longer exist in the latest RewardedAdSettings.
INSERT INTO "RewardedAdSettings"
  ("key", "androidEnabled", "iosEnabled", "dailyAdLimit", "testMode", "updatedAt")
  VALUES ('default', false, false, 1, true, CURRENT_TIMESTAMP)
  ON CONFLICT ("key") DO NOTHING;

INSERT INTO "AccountDeletionCounter" ("id", "totalDeleted", "createdAt", "updatedAt")
  VALUES ('global', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("id") DO NOTHING;

INSERT INTO "CourseContentRevision" ("id", "revision")
  VALUES (1, 0) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "MobileAppReleasePolicy"
  ("key", "iosReviewVersion", "revision", "createdAt", "updatedAt")
  VALUES ('default', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("key") DO NOTHING;

-- Historical 20260726120000 selects the current RewardedAdSettings iosEnabled
-- (false on fresh DB), and sets reviewEnabled false. Never open review mode.
INSERT INTO "AppFeatureFlag" ("key", "enabled", "reviewEnabled", "updatedAt")
  VALUES ('mobile_rewarded_ads_ios', false, false, CURRENT_TIMESTAMP)
  ON CONFLICT ("key") DO NOTHING;
