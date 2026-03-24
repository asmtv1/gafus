-- Уникальные гостевые просмотры статей (дедупликация без авторизации)
CREATE TABLE "ArticleGuestView" (
    "articleId" TEXT NOT NULL,
    "visitorKey" TEXT NOT NULL,
    "firstViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleGuestView_pkey" PRIMARY KEY ("articleId","visitorKey")
);

CREATE INDEX "ArticleGuestView_articleId_idx" ON "ArticleGuestView"("articleId");

ALTER TABLE "ArticleGuestView" ADD CONSTRAINT "ArticleGuestView_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
