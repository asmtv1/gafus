-- Deliberately no User FK: cleanup must survive the account cascade.
CREATE TABLE "AccountStorageCleanup" (
  "id" TEXT PRIMARY KEY,
  "ownerId" TEXT NOT NULL,
  "scope" TEXT NOT NULL CHECK ("scope" IN ('public', 'gallery', 'feed', 'stream')),
  "keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "prefixes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "keyCursor" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'processing', 'done')),
  "purgeOperations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "purgeAfter" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "attemptToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("ownerId", "scope")
);
CREATE INDEX "AccountStorageCleanup_status_availableAt_idx" ON "AccountStorageCleanup" ("status", "availableAt");

-- Preserve other authors' replies when their referenced comment disappears with its author.
ALTER TABLE "FeedComment" DROP CONSTRAINT "FeedComment_rootId_fkey";
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_rootId_fkey" FOREIGN KEY ("rootId") REFERENCES "FeedComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeedComment" DROP CONSTRAINT "FeedComment_replyToId_fkey";
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "FeedComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
