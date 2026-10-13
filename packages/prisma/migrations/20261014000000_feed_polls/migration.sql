-- Additive poll schema for FeedPost: only new tables, indexes and foreign keys.
-- Kept transactional to avoid partially installed poll constraints.
BEGIN;

-- CreateTable
CREATE TABLE "FeedPoll" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "question" VARCHAR(500) NOT NULL,
    "explanation" VARCHAR(2000),
    "allowMultiple" BOOLEAN NOT NULL DEFAULT false,
    "isQuiz" BOOLEAN NOT NULL DEFAULT false,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "hideResults" BOOLEAN NOT NULL DEFAULT false,
    "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" VARCHAR(200) NOT NULL,
    "imageMediaId" TEXT,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FeedPollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedPollVote" (
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedPollVote_pkey" PRIMARY KEY ("pollId","userId")
);

-- CreateTable
CREATE TABLE "FeedPollVoteSelection" (
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "FeedPollVoteSelection_pkey" PRIMARY KEY ("pollId","userId","optionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedPoll_postId_key" ON "FeedPoll"("postId");

-- CreateIndex
CREATE INDEX "FeedPollOption_imageMediaId_idx" ON "FeedPollOption"("imageMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedPollOption_pollId_id_key" ON "FeedPollOption"("pollId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FeedPollOption_pollId_position_key" ON "FeedPollOption"("pollId", "position");

-- CreateIndex
CREATE INDEX "FeedPollVote_userId_idx" ON "FeedPollVote"("userId");

-- CreateIndex
CREATE INDEX "FeedPollVoteSelection_pollId_optionId_idx" ON "FeedPollVoteSelection"("pollId", "optionId");

-- AddForeignKey
ALTER TABLE "FeedPoll" ADD CONSTRAINT "FeedPoll_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPollOption" ADD CONSTRAINT "FeedPollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "FeedPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPollOption" ADD CONSTRAINT "FeedPollOption_imageMediaId_fkey" FOREIGN KEY ("imageMediaId") REFERENCES "FeedMediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPollVote" ADD CONSTRAINT "FeedPollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "FeedPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPollVote" ADD CONSTRAINT "FeedPollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPollVoteSelection" ADD CONSTRAINT "FeedPollVoteSelection_pollId_userId_fkey" FOREIGN KEY ("pollId", "userId") REFERENCES "FeedPollVote"("pollId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPollVoteSelection" ADD CONSTRAINT "FeedPollVoteSelection_pollId_optionId_fkey" FOREIGN KEY ("pollId", "optionId") REFERENCES "FeedPollOption"("pollId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
