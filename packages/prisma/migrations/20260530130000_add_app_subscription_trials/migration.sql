CREATE TABLE IF NOT EXISTS "AppSubscriptionTrial" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "AppSubscriptionProvider" NOT NULL,
  "subscriptionId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppSubscriptionTrial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppSubscriptionTrial_userId_provider_key"
  ON "AppSubscriptionTrial"("userId", "provider");
CREATE INDEX IF NOT EXISTS "AppSubscriptionTrial_provider_startedAt_idx"
  ON "AppSubscriptionTrial"("provider", "startedAt");
CREATE INDEX IF NOT EXISTS "AppSubscriptionTrial_subscriptionId_idx"
  ON "AppSubscriptionTrial"("subscriptionId");

ALTER TABLE "AppSubscriptionTrial"
  ADD CONSTRAINT "AppSubscriptionTrial_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppSubscriptionTrial"
  ADD CONSTRAINT "AppSubscriptionTrial_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "AppSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "AppSubscriptionTrial" (
  "id",
  "userId",
  "provider",
  "subscriptionId",
  "startedAt",
  "endedAt",
  "createdAt",
  "updatedAt"
)
SELECT DISTINCT ON (s."userId", s."provider")
  'trial_' || md5(s."userId" || ':' || s."provider"::text) AS "id",
  s."userId",
  s."provider",
  s."id" AS "subscriptionId",
  COALESCE(s."currentPeriodStart", s."createdAt") AS "startedAt",
  s."currentPeriodEnd" AS "endedAt",
  LEAST(COALESCE(s."currentPeriodStart", s."createdAt"), s."createdAt") AS "createdAt",
  NOW() AS "updatedAt"
FROM "AppSubscription" s
WHERE s."provider" = 'YOOKASSA'
  AND s."currentPeriodEnd" IS NOT NULL
  AND (
    NOT EXISTS (
      SELECT 1
      FROM "AppSubscriptionPayment" p
      WHERE p."subscriptionId" = s."id"
        AND p."provider" = 'YOOKASSA'
        AND p."status" = 'SUCCEEDED'
    )
    OR EXISTS (
      SELECT 1
      FROM "AppSubscriptionPayment" p
      WHERE p."subscriptionId" = s."id"
        AND p."provider" = 'YOOKASSA'
        AND p."kind" = 'INITIAL'
    )
  )
ORDER BY s."userId", s."provider", COALESCE(s."currentPeriodStart", s."createdAt") ASC
ON CONFLICT ("userId", "provider") DO NOTHING;
