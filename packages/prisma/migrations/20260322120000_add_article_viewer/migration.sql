-- CreateTable
CREATE TABLE "ArticleViewer" (
    "articleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleViewer_pkey" PRIMARY KEY ("articleId","userId")
);

-- CreateIndex
CREATE INDEX "ArticleViewer_articleId_idx" ON "ArticleViewer"("articleId");

-- CreateIndex
CREATE INDEX "ArticleViewer_userId_idx" ON "ArticleViewer"("userId");

-- AddForeignKey
ALTER TABLE "ArticleViewer" ADD CONSTRAINT "ArticleViewer_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleViewer" ADD CONSTRAINT "ArticleViewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
