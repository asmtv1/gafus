-- CreateEnum
CREATE TYPE "FeedPostStatus" AS ENUM ('draft', 'pending', 'published', 'failed', 'deleted');

-- CreateEnum
CREATE TYPE "FeedRevisionStatus" AS ENUM ('draft', 'pending', 'ready', 'failed', 'superseded');

-- CreateEnum
CREATE TYPE "FeedMediaKind" AS ENUM ('photo', 'video');

-- CreateEnum
CREATE TYPE "FeedMediaStatus" AS ENUM ('reserved', 'uploaded', 'processing', 'ready', 'failed', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "FeedJobKind" AS ENUM ('copy_album', 'publish_photo', 'publish_video', 'delete_keys', 'cleanup_source');

-- CreateEnum
CREATE TYPE "FeedJobStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "FeedReactionKind" AS ENUM ('heart', 'laugh', 'dog', 'fire', 'like');

-- CreateEnum
CREATE TYPE "FeedNotificationKind" AS ENUM ('comment', 'reply', 'post_reaction', 'comment_reaction');

-- CreateTable
CREATE TABLE "FeedPost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "status" "FeedPostStatus" NOT NULL DEFAULT 'draft',
    "clientRequestId" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "activeRevisionId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPostRevision" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "status" "FeedRevisionStatus" NOT NULL DEFAULT 'draft',
    "text" VARCHAR(5000) NOT NULL DEFAULT '',
    "clientRequestId" VARCHAR(64) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedPostRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedMediaAsset" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" "FeedMediaKind" NOT NULL,
    "status" "FeedMediaStatus" NOT NULL DEFAULT 'reserved',
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" DOUBLE PRECISION,
    "thumbKey" TEXT,
    "fullKey" TEXT,
    "posterKey" TEXT,
    "playlistKey" TEXT,
    "videoSegmentKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedMediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedRevisionAttachment" (
    "revisionId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "FeedRevisionAttachment_pkey" PRIMARY KEY ("revisionId","mediaId")
);

-- CreateTable
CREATE TABLE "FeedUpload" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "clientRequestId" VARCHAR(64) NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "declaredMime" VARCHAR(64) NOT NULL,
    "declaredBytes" INTEGER NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceETag" TEXT,
    "status" "FeedMediaStatus" NOT NULL DEFAULT 'reserved',
    "postExpiresAt" TIMESTAMP(3) NOT NULL,
    "reservationExpiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "attemptToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedStorageJob" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "postId" TEXT,
    "uploadId" TEXT,
    "mediaId" TEXT,
    "kind" "FeedJobKind" NOT NULL,
    "status" "FeedJobStatus" NOT NULL DEFAULT 'pending',
    "sourceKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "attemptToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedStorageJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "rootId" TEXT,
    "replyToId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "clientRequestId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPostReaction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "FeedReactionKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedPostReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedCommentReaction" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "FeedReactionKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedCommentReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPostView" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedPostView_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "FeedNotification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "commentId" TEXT,
    "kind" "FeedNotificationKind" NOT NULL,
    "groupKey" VARCHAR(255),
    "actorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reaction" "FeedReactionKind",
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedNotificationOutbox" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "FeedJobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "attemptToken" TEXT,
    "lastErrorCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedNotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedPost_status_publishedAt_id_idx" ON "FeedPost"("status", "publishedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "FeedPost_authorId_status_publishedAt_id_idx" ON "FeedPost"("authorId", "status", "publishedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "FeedPost_authorId_deletedAt_updatedAt_idx" ON "FeedPost"("authorId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedPost_authorId_clientRequestId_key" ON "FeedPost"("authorId", "clientRequestId");

-- CreateIndex
CREATE INDEX "FeedPostRevision_postId_status_createdAt_idx" ON "FeedPostRevision"("postId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedPostRevision_postId_revisionNumber_key" ON "FeedPostRevision"("postId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FeedPostRevision_postId_clientRequestId_key" ON "FeedPostRevision"("postId", "clientRequestId");

-- CreateIndex
CREATE INDEX "FeedMediaAsset_postId_status_idx" ON "FeedMediaAsset"("postId", "status");

-- CreateIndex
CREATE INDEX "FeedMediaAsset_ownerId_status_idx" ON "FeedMediaAsset"("ownerId", "status");

-- CreateIndex
CREATE INDEX "FeedRevisionAttachment_mediaId_idx" ON "FeedRevisionAttachment"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedRevisionAttachment_revisionId_position_key" ON "FeedRevisionAttachment"("revisionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "FeedUpload_mediaId_key" ON "FeedUpload"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedUpload_sourceKey_key" ON "FeedUpload"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "FeedUpload_attemptToken_key" ON "FeedUpload"("attemptToken");

-- CreateIndex
CREATE INDEX "FeedUpload_status_reservationExpiresAt_leaseUntil_idx" ON "FeedUpload"("status", "reservationExpiresAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "FeedUpload_postId_status_idx" ON "FeedUpload"("postId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FeedUpload_ownerId_clientRequestId_key" ON "FeedUpload"("ownerId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedStorageJob_dedupeKey_key" ON "FeedStorageJob"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "FeedStorageJob_attemptToken_key" ON "FeedStorageJob"("attemptToken");

-- CreateIndex
CREATE INDEX "FeedStorageJob_status_availableAt_leaseUntil_idx" ON "FeedStorageJob"("status", "availableAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "FeedStorageJob_ownerId_postId_idx" ON "FeedStorageJob"("ownerId", "postId");

-- CreateIndex
CREATE INDEX "FeedComment_postId_rootId_createdAt_id_idx" ON "FeedComment"("postId", "rootId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "FeedComment_replyToId_idx" ON "FeedComment"("replyToId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedComment_authorId_clientRequestId_key" ON "FeedComment"("authorId", "clientRequestId");

-- CreateIndex
CREATE INDEX "FeedPostReaction_postId_kind_createdAt_id_idx" ON "FeedPostReaction"("postId", "kind", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FeedPostReaction_postId_userId_key" ON "FeedPostReaction"("postId", "userId");

-- CreateIndex
CREATE INDEX "FeedCommentReaction_commentId_kind_createdAt_id_idx" ON "FeedCommentReaction"("commentId", "kind", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FeedCommentReaction_commentId_userId_key" ON "FeedCommentReaction"("commentId", "userId");

-- CreateIndex
CREATE INDEX "FeedPostView_postId_idx" ON "FeedPostView"("postId");

-- CreateIndex
CREATE INDEX "FeedNotification_recipientId_readAt_createdAt_id_idx" ON "FeedNotification"("recipientId", "readAt", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "FeedNotification_groupKey_createdAt_idx" ON "FeedNotification"("groupKey", "createdAt");

-- CreateIndex
CREATE INDEX "FeedNotificationOutbox_status_availableAt_leaseUntil_idx" ON "FeedNotificationOutbox"("status", "availableAt", "leaseUntil");
CREATE UNIQUE INDEX "FeedNotificationOutbox_attemptToken_key" ON "FeedNotificationOutbox"("attemptToken");

-- CreateIndex
CREATE UNIQUE INDEX "FeedNotificationOutbox_notificationId_key" ON "FeedNotificationOutbox"("notificationId");

-- AddForeignKey
ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPostRevision" ADD CONSTRAINT "FeedPostRevision_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedMediaAsset" ADD CONSTRAINT "FeedMediaAsset_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedMediaAsset" ADD CONSTRAINT "FeedMediaAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedRevisionAttachment" ADD CONSTRAINT "FeedRevisionAttachment_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "FeedPostRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedRevisionAttachment" ADD CONSTRAINT "FeedRevisionAttachment_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "FeedMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedUpload" ADD CONSTRAINT "FeedUpload_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedUpload" ADD CONSTRAINT "FeedUpload_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedUpload" ADD CONSTRAINT "FeedUpload_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "FeedMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_rootId_fkey" FOREIGN KEY ("rootId") REFERENCES "FeedComment"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "FeedComment"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPostReaction" ADD CONSTRAINT "FeedPostReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPostReaction" ADD CONSTRAINT "FeedPostReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedCommentReaction" ADD CONSTRAINT "FeedCommentReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "FeedComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedCommentReaction" ADD CONSTRAINT "FeedCommentReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPostView" ADD CONSTRAINT "FeedPostView_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPostView" ADD CONSTRAINT "FeedPostView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedNotification" ADD CONSTRAINT "FeedNotification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedNotification" ADD CONSTRAINT "FeedNotification_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedNotification" ADD CONSTRAINT "FeedNotification_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "FeedComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

