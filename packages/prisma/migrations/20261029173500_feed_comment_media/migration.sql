-- Feed Media V2 uploads belong either to a post revision or to a comment.
ALTER TABLE "FeedUpload" ADD COLUMN "purpose" VARCHAR(16) NOT NULL DEFAULT 'post';
ALTER TABLE "FeedUpload" ADD CONSTRAINT "FeedUpload_purpose_check" CHECK ("purpose" IN ('post', 'comment'));
CREATE TABLE "FeedCommentMedia" (
  "commentId" TEXT NOT NULL,
  "mediaId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  CONSTRAINT "FeedCommentMedia_pkey" PRIMARY KEY ("commentId","mediaId"),
  CONSTRAINT "FeedCommentMedia_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "FeedComment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FeedCommentMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "FeedMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FeedCommentMedia_mediaId_key" ON "FeedCommentMedia"("mediaId");
CREATE UNIQUE INDEX "FeedCommentMedia_commentId_position_key" ON "FeedCommentMedia"("commentId","position");
CREATE INDEX "FeedUpload_purpose_createdAt_idx" ON "FeedUpload"("purpose","createdAt");
