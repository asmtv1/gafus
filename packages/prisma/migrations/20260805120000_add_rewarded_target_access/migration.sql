-- Direct, time-limited access granted after a rewarded ad. Legacy Gafus
-- unlocks are migrated into the same access table with a shared cutoff.

CREATE TYPE "RewardedTargetAccessType" AS ENUM ('ARTICLE', 'COURSE_STEP');
CREATE TYPE "RewardedTargetAccessSource" AS ENUM ('REWARDED_AD', 'LEGACY_GAFUS');

CREATE TABLE "RewardedTargetAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "RewardedTargetAccessType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "source" "RewardedTargetAccessSource" NOT NULL,
    "platform" "RewardedPlatform",
    "sessionId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardedTargetAccess_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RewardedTargetAccess_target_id_nonempty"
      CHECK (length(btrim("targetId")) > 0),
    CONSTRAINT "RewardedTargetAccess_valid_period"
      CHECK ("expiresAt" > "grantedAt"),
    CONSTRAINT "RewardedTargetAccess_source_consistency"
      CHECK (
        (
          "source" = 'REWARDED_AD'::"RewardedTargetAccessSource"
          AND "platform" IS NOT NULL
        )
        OR
        (
          "source" = 'LEGACY_GAFUS'::"RewardedTargetAccessSource"
          AND "platform" IS NULL
          AND "sessionId" IS NULL
        )
      )
);

CREATE UNIQUE INDEX "RewardedTargetAccess_sessionId_key"
  ON "RewardedTargetAccess"("sessionId");

CREATE INDEX "RewardedTargetAccess_userId_targetType_targetId_expiresAt_idx"
  ON "RewardedTargetAccess"("userId", "targetType", "targetId", "expiresAt");

CREATE INDEX "RewardedTargetAccess_expiresAt_idx"
  ON "RewardedTargetAccess"("expiresAt");

ALTER TABLE "RewardedTargetAccess"
  ADD CONSTRAINT "RewardedTargetAccess_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RewardedTargetAccess"
  ADD CONSTRAINT "RewardedTargetAccess_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "RewardedAdSession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The old implementation treated any SPEND transaction for a target as a
-- permanent unlock. Preserve exactly those ARTICLE and COURSE_STEP unlocks,
-- but give every migrated access the agreed common seven-day window:
-- 10 August 2026 00:00 Moscow through 17 August 2026 00:00 Moscow
-- (09 August 21:00 UTC through 16 August 21:00 UTC).
INSERT INTO "RewardedTargetAccess" (
  "id",
  "userId",
  "targetType",
  "targetId",
  "source",
  "platform",
  "sessionId",
  "grantedAt",
  "expiresAt",
  "createdAt"
)
SELECT DISTINCT ON (legacy_spend."userId", legacy_spend."targetType", legacy_spend."targetId")
  'legacy:' || legacy_spend."id",
  legacy_spend."userId",
  legacy_spend."targetType"::text::"RewardedTargetAccessType",
  legacy_spend."targetId",
  'LEGACY_GAFUS'::"RewardedTargetAccessSource",
  NULL,
  NULL,
  TIMESTAMP '2026-08-09 21:00:00',
  TIMESTAMP '2026-08-16 21:00:00',
  CURRENT_TIMESTAMP
FROM "RewardedCreditTransaction" AS legacy_spend
WHERE legacy_spend."type" = 'SPEND'::"RewardedCreditTransactionType"
  AND legacy_spend."targetType" IN (
    'ARTICLE'::"RewardedTargetType",
    'COURSE_STEP'::"RewardedTargetType"
  )
  AND legacy_spend."targetId" IS NOT NULL
  AND length(btrim(legacy_spend."targetId")) > 0
ORDER BY
  legacy_spend."userId",
  legacy_spend."targetType",
  legacy_spend."targetId",
  legacy_spend."createdAt" ASC,
  legacy_spend."id" ASC;

-- Credits no longer have purchasing power. Clear both immediately spendable
-- and pending-refund balances while retaining the old ledger for verification.
UPDATE "RewardedCreditWallet"
SET
  "balance" = 0,
  "pendingRefundCredits" = 0,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "balance" <> 0 OR "pendingRefundCredits" <> 0;
