-- Additional feed telemetry and normalized breed taxonomy, additive and reversible.
ALTER TABLE "Pet" ADD COLUMN "breedKey" VARCHAR(160);
CREATE FUNCTION "feed_normalize_breed_key"(raw TEXT) RETURNS VARCHAR(160) AS $$
DECLARE value TEXT;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  value := LEFT(TRANSLATE(
    LOWER(TRIM(REGEXP_REPLACE(NORMALIZE(raw, NFKC), '[[:space:]]+', ' ', 'g'))),
    'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
    'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'
  ), 160);
  IF value IN ('labrador', 'labrador retriever', 'лабрадор ретривер', 'лабрадор-ретривер') THEN value := 'лабрадор'; END IF;
  IF value IN ('golden', 'golden retriever') THEN value := 'золотистый ретривер'; END IF;
  IF value IN ('йорк', 'yorkshire terrier') THEN value := 'йоркширский терьер'; END IF;
  IF value = 'french bulldog' THEN value := 'французский бульдог'; END IF;
  RETURN NULLIF(value, '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;
UPDATE "Pet" SET "breedKey" = "feed_normalize_breed_key"("breed");
CREATE INDEX "Pet_breedKey_idx" ON "Pet"("breedKey");
CREATE FUNCTION "feed_normalize_pet_breed"() RETURNS trigger AS $$
BEGIN
  NEW."breedKey" := "feed_normalize_breed_key"(NEW."breed");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "feed_pet_breed_key_sync"
  BEFORE INSERT OR UPDATE OF "breed" ON "Pet"
  FOR EACH ROW EXECUTE FUNCTION "feed_normalize_pet_breed"();

CREATE TABLE "FeedRankingEvent" (
  "eventId" VARCHAR(64) NOT NULL,
  "userId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "rankingSessionId" VARCHAR(64) NOT NULL,
  "kind" VARCHAR(32) NOT NULL,
  "durationMs" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedRankingEvent_pkey" PRIMARY KEY ("eventId"),
  CONSTRAINT "FeedRankingEvent_kind_chk" CHECK ("kind" IN ('dwell','post_open','profile_open')),
  CONSTRAINT "FeedRankingEvent_duration_chk" CHECK ("durationMs" >= 0 AND "durationMs" <= 120000)
);
CREATE INDEX "FeedRankingEvent_userId_createdAt_idx" ON "FeedRankingEvent"("userId","createdAt" DESC);
CREATE INDEX "FeedRankingEvent_postId_createdAt_idx" ON "FeedRankingEvent"("postId","createdAt" DESC);
CREATE INDEX "FeedRankingEvent_rankingSessionId_idx" ON "FeedRankingEvent"("rankingSessionId");
ALTER TABLE "FeedRankingEvent" ADD CONSTRAINT "FeedRankingEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedRankingEvent" ADD CONSTRAINT "FeedRankingEvent_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
