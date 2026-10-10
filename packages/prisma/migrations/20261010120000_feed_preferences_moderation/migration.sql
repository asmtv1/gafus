-- AlterEnum
ALTER TYPE "FeedNotificationKind" ADD VALUE 'author_post';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "feedPublishingBlockReason" VARCHAR(1000),
ADD COLUMN     "feedPublishingBlocked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "FeedPost" ADD COLUMN     "moderatedAt" TIMESTAMP(3),
ADD COLUMN     "moderationReason" VARCHAR(1000),
ADD COLUMN     "moderationState" VARCHAR(16) NOT NULL DEFAULT 'visible';

-- AlterTable
ALTER TABLE "FeedComment" ADD COLUMN     "moderatedAt" TIMESTAMP(3),
ADD COLUMN     "moderationReason" VARCHAR(1000),
ADD COLUMN     "moderationState" VARCHAR(16) NOT NULL DEFAULT 'visible';

-- CreateTable
CREATE TABLE "FeedBookmark" (
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedBookmark_pkey" PRIMARY KEY ("userId","postId")
);

-- CreateTable
CREATE TABLE "FeedAuthorPreference" (
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "notify" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedAuthorPreference_pkey" PRIMARY KEY ("userId","authorId")
);

-- CreateTable
CREATE TABLE "FeedReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "targetType" VARCHAR(16) NOT NULL,
    "targetId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "snapshotText" VARCHAR(5000) NOT NULL,
    "reason" VARCHAR(64) NOT NULL,
    "comment" VARCHAR(1000) NOT NULL DEFAULT '',
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "resolution" VARCHAR(16),
    "resolutionReason" VARCHAR(1000),
    "moderatorId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedModerationAction" (
    "id" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedBookmark_userId_createdAt_postId_idx" ON "FeedBookmark"("userId", "createdAt" DESC, "postId" DESC);

-- CreateIndex
CREATE INDEX "FeedAuthorPreference_authorId_notify_hidden_idx" ON "FeedAuthorPreference"("authorId", "notify", "hidden");

-- CreateIndex
CREATE INDEX "FeedReport_status_createdAt_id_idx" ON "FeedReport"("status", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "FeedReport_authorId_idx" ON "FeedReport"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedReport_reporterId_targetType_targetId_key" ON "FeedReport"("reporterId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "FeedModerationAction_reportId_createdAt_idx" ON "FeedModerationAction"("reportId", "createdAt");

-- AddForeignKey
ALTER TABLE "FeedBookmark" ADD CONSTRAINT "FeedBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedBookmark" ADD CONSTRAINT "FeedBookmark_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedAuthorPreference" ADD CONSTRAINT "FeedAuthorPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedAuthorPreference" ADD CONSTRAINT "FeedAuthorPreference_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
