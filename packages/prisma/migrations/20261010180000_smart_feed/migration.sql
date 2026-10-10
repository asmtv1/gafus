-- Additive migration for the personalized Moments feed. Existing views and reactions are preserved.
ALTER TABLE "UserProfile" ADD COLUMN "cityKey" VARCHAR(160);
UPDATE "UserProfile" SET "cityKey" = NULLIF(LEFT(
  TRANSLATE(
    LOWER(TRIM(REGEXP_REPLACE(NORMALIZE("city", NFKC), '[[:space:]]+', ' ', 'g'))),
    'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
    'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'
  ), 160
), '') WHERE "city" IS NOT NULL;
CREATE INDEX "UserProfile_cityKey_idx" ON "UserProfile"("cityKey");

-- Keep cityKey synchronized regardless of whether the profile was edited on
-- Web, Mobile, or from an existing service that only updates the city field.
CREATE FUNCTION "feed_normalize_profile_city"() RETURNS trigger AS $$
BEGIN
  NEW."cityKey" := CASE WHEN NEW."city" IS NULL THEN NULL
    ELSE NULLIF(LEFT(TRANSLATE(
      LOWER(TRIM(REGEXP_REPLACE(
        NORMALIZE(NEW."city", NFKC), '[[:space:]]+', ' ', 'g'
      ))),
      'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
      'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'
    ), 160), '') END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "feed_profile_city_key_sync"
  BEFORE INSERT OR UPDATE OF "city" ON "UserProfile"
  FOR EACH ROW EXECUTE FUNCTION "feed_normalize_profile_city"();

CREATE TABLE "FeedPersonalizationPreference" (
  "userId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "useCity" BOOLEAN NOT NULL DEFAULT TRUE,
  "usePets" BOOLEAN NOT NULL DEFAULT TRUE,
  "useBehavior" BOOLEAN NOT NULL DEFAULT TRUE,
  "exploration" BOOLEAN NOT NULL DEFAULT TRUE,
  "historyResetAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedPersonalizationPreference_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "FeedPersonalizationPreference"
  ADD CONSTRAINT "FeedPersonalizationPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FeedImpression" (
  "id" TEXT NOT NULL,
  "eventId" VARCHAR(64) NOT NULL,
  "userId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "rankingSessionId" VARCHAR(64) NOT NULL,
  "algorithmVersion" VARCHAR(64) NOT NULL,
  "rank" INTEGER NOT NULL,
  "visibleMs" INTEGER NOT NULL DEFAULT 0,
  "features" JSONB,
  "candidateSources" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "modelVersion" VARCHAR(64),
  "experimentVariant" VARCHAR(16),
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedImpression_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeedImpression_eventId_key" ON "FeedImpression"("eventId");
CREATE UNIQUE INDEX "FeedImpression_userId_postId_rankingSessionId_key"
  ON "FeedImpression"("userId", "postId", "rankingSessionId");
CREATE INDEX "FeedImpression_userId_occurredAt_idx" ON "FeedImpression"("userId", "occurredAt" DESC);
CREATE INDEX "FeedImpression_postId_occurredAt_idx" ON "FeedImpression"("postId", "occurredAt" DESC);
CREATE INDEX "FeedImpression_rankingSessionId_idx" ON "FeedImpression"("rankingSessionId");
ALTER TABLE "FeedImpression"
  ADD CONSTRAINT "FeedImpression_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedImpression"
  ADD CONSTRAINT "FeedImpression_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FeedPostStats" (
  "postId" TEXT NOT NULL,
  "reactionCount" INTEGER NOT NULL DEFAULT 0,
  "uniqueCommenterCount" INTEGER NOT NULL DEFAULT 0,
  "bookmarkCount" INTEGER NOT NULL DEFAULT 0,
  "uniqueViewCount" INTEGER NOT NULL DEFAULT 0,
  "qualifiedImpressionCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedPostStats_pkey" PRIMARY KEY ("postId")
);
ALTER TABLE "FeedPostStats"
  ADD CONSTRAINT "FeedPostStats_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FeedUserAuthorAffinity" (
  "userId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reactionCount" INTEGER NOT NULL DEFAULT 0,
  "commentCount" INTEGER NOT NULL DEFAULT 0,
  "bookmarkCount" INTEGER NOT NULL DEFAULT 0,
  "qualifiedViewCount" INTEGER NOT NULL DEFAULT 0,
  "lastInteractionAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedUserAuthorAffinity_pkey" PRIMARY KEY ("userId", "authorId")
);
CREATE INDEX "FeedUserAuthorAffinity_userId_score_idx"
  ON "FeedUserAuthorAffinity"("userId", "score" DESC);
ALTER TABLE "FeedUserAuthorAffinity"
  ADD CONSTRAINT "FeedUserAuthorAffinity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedUserAuthorAffinity"
  ADD CONSTRAINT "FeedUserAuthorAffinity_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FeedUserPostFeedback" (
  "userId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "kind" VARCHAR(32) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedUserPostFeedback_pkey" PRIMARY KEY ("userId", "postId", "kind")
);
CREATE INDEX "FeedUserPostFeedback_postId_idx" ON "FeedUserPostFeedback"("postId");
ALTER TABLE "FeedUserPostFeedback"
  ADD CONSTRAINT "FeedUserPostFeedback_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedUserPostFeedback"
  ADD CONSTRAINT "FeedUserPostFeedback_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FeedSmartRankerModel" (
  "id" TEXT NOT NULL,
  "version" VARCHAR(64) NOT NULL,
  "artifact" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT FALSE,
  "trainedAt" TIMESTAMP(3) NOT NULL,
  "trainRows" INTEGER NOT NULL,
  "validationRows" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedSmartRankerModel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeedSmartRankerModel_version_key" ON "FeedSmartRankerModel"("version");
CREATE INDEX "FeedSmartRankerModel_active_trainedAt_idx"
  ON "FeedSmartRankerModel"("active", "trainedAt" DESC);
