-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "activityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),
    "bestAnswerId" TEXT,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "parentId" TEXT,
    "replyToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),

    CONSTRAINT "QuestionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionHeart" (
    "answerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionHeart_pkey" PRIMARY KEY ("answerId","userId")
);

-- CreateTable
CREATE TABLE "QuestionView" (
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionView_pkey" PRIMARY KEY ("questionId","userId")
);

-- CreateTable
CREATE TABLE "QuestionPhoto" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "questionId" TEXT,
    "answerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerId" TEXT,
    "targetKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,

    CONSTRAINT "QuestionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBlock" (
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionBlock_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Question_bestAnswerId_key" ON "Question"("bestAnswerId");

-- CreateIndex
CREATE INDEX "Question_createdAt_id_idx" ON "Question"("createdAt", "id");

-- CreateIndex
CREATE INDEX "Question_activityAt_id_idx" ON "Question"("activityAt", "id");

-- CreateIndex
CREATE INDEX "Question_authorId_createdAt_idx" ON "Question"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "Question_category_createdAt_idx" ON "Question"("category", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Question_authorId_clientRequestId_key" ON "Question"("authorId", "clientRequestId");

-- CreateIndex
CREATE INDEX "QuestionAnswer_questionId_parentId_createdAt_idx" ON "QuestionAnswer"("questionId", "parentId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionAnswer_authorId_createdAt_idx" ON "QuestionAnswer"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionAnswer_replyToId_idx" ON "QuestionAnswer"("replyToId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionAnswer_authorId_clientRequestId_key" ON "QuestionAnswer"("authorId", "clientRequestId");

-- CreateIndex
CREATE INDEX "QuestionHeart_userId_idx" ON "QuestionHeart"("userId");

-- CreateIndex
CREATE INDEX "QuestionView_userId_idx" ON "QuestionView"("userId");

-- CreateIndex
CREATE INDEX "QuestionPhoto_ownerId_createdAt_idx" ON "QuestionPhoto"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionPhoto_questionId_idx" ON "QuestionPhoto"("questionId");

-- CreateIndex
CREATE INDEX "QuestionPhoto_answerId_idx" ON "QuestionPhoto"("answerId");

-- CreateIndex
CREATE INDEX "QuestionReport_resolvedAt_createdAt_idx" ON "QuestionReport"("resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionReport_questionId_idx" ON "QuestionReport"("questionId");

-- CreateIndex
CREATE INDEX "QuestionReport_answerId_idx" ON "QuestionReport"("answerId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionReport_reporterId_targetKey_key" ON "QuestionReport"("reporterId", "targetKey");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_bestAnswerId_fkey" FOREIGN KEY ("bestAnswerId") REFERENCES "QuestionAnswer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "QuestionAnswer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "QuestionAnswer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionHeart" ADD CONSTRAINT "QuestionHeart_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "QuestionAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionHeart" ADD CONSTRAINT "QuestionHeart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionView" ADD CONSTRAINT "QuestionView_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionView" ADD CONSTRAINT "QuestionView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPhoto" ADD CONSTRAINT "QuestionPhoto_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPhoto" ADD CONSTRAINT "QuestionPhoto_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionPhoto" ADD CONSTRAINT "QuestionPhoto_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "QuestionAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReport" ADD CONSTRAINT "QuestionReport_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "QuestionAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBlock" ADD CONSTRAINT "QuestionBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
